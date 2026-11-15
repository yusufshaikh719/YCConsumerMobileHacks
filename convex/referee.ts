import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { ROAST_PERSONAS } from "./personas";

type Context = {
  submission: Doc<"submissions">;
  challenge: Doc<"challenges">;
  pot: Doc<"pots">;
  user: Doc<"users">;
  member: Doc<"memberships"> | null;
  imageUrl: string | null;
};

type VlmResult = {
  habitPassed: boolean;
  challengePassed: boolean;
  visualSpoofDetected: boolean;
  visualSpoofReasons: string[];
  confidence: number;
  roastMessage: string;
};

export const getSubmissionContext = internalQuery({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }): Promise<Context | null> => {
    const submission = await ctx.db.get(submissionId);
    if (!submission) return null;
    const [challenge, pot, user, member, storageUrl] = await Promise.all([
      ctx.db.get(submission.challengeId),
      ctx.db.get(submission.potId),
      ctx.db.get(submission.userId),
      ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", submission.potId).eq("userId", submission.userId)).unique(),
      submission.storageId ? ctx.storage.getUrl(submission.storageId) : Promise.resolve(null),
    ]);
    if (!challenge || !pot || !user) return null;
    return { submission, challenge, pot, user, member, imageUrl: storageUrl ?? submission.imageUrl ?? null };
  },
});

function parseResult(value: unknown): VlmResult {
  if (!value || typeof value !== "object") throw new Error("Invalid VLM result");
  const result = value as Record<string, unknown>;
  if (typeof result.habitPassed !== "boolean" || typeof result.challengePassed !== "boolean" ||
      typeof result.visualSpoofDetected !== "boolean" || !Array.isArray(result.visualSpoofReasons) ||
      !result.visualSpoofReasons.every(reason => typeof reason === "string") ||
      typeof result.confidence !== "number" || !Number.isFinite(result.confidence) ||
      typeof result.roastMessage !== "string" || !result.roastMessage.trim()) {
    throw new Error("Invalid VLM result");
  }
  return result as VlmResult;
}

async function evaluateLive(context: Context, signal: AbortSignal): Promise<VlmResult> {
  const { submission, challenge, pot, imageUrl } = context;
  if (!imageUrl) throw new Error("Missing image");
  const persona = ROAST_PERSONAS[pot.roastPersona];
  const prompt = `Evaluate this photo as evidence of the habit and live camera challenge. Habit: ${pot.habitPrompt}\nChallenge: ${challenge.promptText}\nVerification code: ${challenge.verificationCode}\nClient telemetry: gyroVariance=${submission.gyroVariance}, screenGlareSuspected=${submission.screenGlareSuspected}, capture-to-upload milliseconds=${submission.uploadedAt - submission.capturedAt}. Return only JSON with habitPassed, challengePassed, visualSpoofDetected (booleans), visualSpoofReasons (array of concise signal strings), confidence (number from 0 to 1), and roastMessage (string). The roast must fit the verdict and this voice: ${persona.systemInstruction}`;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const image = await fetch(imageUrl, { signal });
    if (!image.ok) throw new Error("Image fetch failed");
    const bytes = new Uint8Array(await image.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const model = process.env.GEMINI_VLM_MODEL || "gemini-2.5-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: image.headers.get("content-type")?.split(";")[0] || "image/jpeg", data: btoa(binary) } }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    if (!response.ok) throw new Error("Gemini request failed");
    const body = await response.json();
    return parseResult(JSON.parse(body.candidates[0].content.parts[0].text));
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_VLM_MODEL || "gpt-4o-mini", response_format: { type: "json_object" }, messages: [{ role: "system", content: persona.systemInstruction }, { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageUrl } }] }] }),
  });
  if (!response.ok) throw new Error("OpenAI request failed");
  const body = await response.json();
  return parseResult(JSON.parse(body.choices[0].message.content));
}

export const evaluateSubmissionProof = internalAction({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }): Promise<void> => {
    const context: Context | null = await ctx.runQuery(internal.referee.getSubmissionContext, { submissionId });
    if (!context || context.submission.verdict !== "pending") return;
    const { submission, pot, user, member } = context;
    const signals: string[] = [];
    if (submission.screenGlareSuspected) signals.push("screen_glare");
    if (submission.gyroVariance < 0.015) signals.push("low_motion");
    if (submission.uploadedAt - submission.capturedAt > 45_000) signals.push("capture_latency_anomaly");
    const persona = ROAST_PERSONAS[pot.roastPersona];
    const player = user.handle ? `@${user.handle.replace(/^@/, "")}` : user.name;
    let live: VlmResult | null = null;
    if (context.imageUrl && (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)) {
      const signal = AbortSignal.timeout(5500);
      try {
        live = await Promise.race([
          evaluateLive(context, signal),
          new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("VLM timeout")), { once: true })),
        ]);
      } catch {
        live = null;
      }
    }
    if (!live) {
      const spoofSignals = signals.filter(s => s === "screen_glare" || s === "low_motion");
      const verdict = spoofSignals.length ? "failed_spoof" : "passed";
      let streakCount = member?.streakCount ?? 0;
      if (verdict === "passed") {
        streakCount = 1;
        for (let day = submission.dayIndex - 1; member?.completedDays.includes(day); day--) streakCount++;
      }
      await ctx.runMutation(internal.submissions.recordRefereeVerdict, {
        submissionId, verdict, trustScore: spoofSignals.length ? 16 : 92, spoofSignals,
        roastMessage: persona.buildFallbackRoast({ verdict, userName: player, habitPrompt: pot.habitPrompt, spoofSignals, streakCount }),
        evaluationMode: "fallback",
      });
      return;
    }
    const spoofSignals = [...new Set([...signals, ...live.visualSpoofReasons.filter(Boolean), ...(!live.challengePassed ? ["missing_challenge_gesture"] : [])])];
    const telemetryOverride = signals.length >= 2 && !live.visualSpoofDetected;
    const verdict = live.visualSpoofDetected || telemetryOverride ? "failed_spoof" : !live.habitPassed || !live.challengePassed ? "failed_habit" : "passed";
    const trustScore = Math.max(0, Math.min(100, Math.round(live.confidence * 100)));
    await ctx.runMutation(internal.submissions.recordRefereeVerdict, {
      submissionId, verdict, trustScore, spoofSignals,
      roastMessage: telemetryOverride
        ? persona.buildFallbackRoast({ verdict, userName: player, habitPrompt: pot.habitPrompt, spoofSignals, streakCount: member?.streakCount ?? 0 })
        : `${player}: ${live.roastMessage.trim()}`,
      evaluationMode: "live",
    });
  },
});
