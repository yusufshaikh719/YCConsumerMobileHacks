import { anyApi } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { ROAST_PERSONAS } from "./personas";

const point = v.object({ lat: v.number(), lng: v.number(), timestamp: v.number(), speedMps: v.optional(v.number()), accuracyM: v.optional(v.number()) });
type Point = { lat: number; lng: number; timestamp: number; speedMps?: number; accuracyM?: number };

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function validatePoints(points: Point[], startsAt: number, now: number) {
  if (points.length > 1000) throw new Error("Too many GPS points");
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90 || !Number.isFinite(p.lng) || p.lng < -180 || p.lng > 180 ||
        !Number.isFinite(p.timestamp) || p.timestamp < startsAt || p.timestamp > now || (i > 0 && p.timestamp <= points[i - 1].timestamp) ||
        (p.speedMps !== undefined && (!Number.isFinite(p.speedMps) || p.speedMps < 0)) ||
        (p.accuracyM !== undefined && (!Number.isFinite(p.accuracyM) || p.accuracyM < 0))) {
      throw new Error("Invalid GPS telemetry");
    }
  }
}

function assess(points: Point[], quest: Doc<"sidequests">, submittedAt: number, arrivalCapturedAt: number) {
  const origin = { lat: quest.originLat, lng: quest.originLng };
  const destination = { lat: quest.destLat, lng: quest.destLng };
  let totalDistanceMeters = 0;
  let minDistanceToDestMeters = distance(origin, destination);
  let maxSpeedMps = 0;
  let displacement = 0;
  let teleport = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    minDistanceToDestMeters = Math.min(minDistanceToDestMeters, distance(p, destination));
    maxSpeedMps = Math.max(maxSpeedMps, p.speedMps ?? 0);
    if (i > 0) {
      const segment = distance(points[i - 1], p);
      const seconds = (p.timestamp - points[i - 1].timestamp) / 1000;
      totalDistanceMeters += segment;
      maxSpeedMps = Math.max(maxSpeedMps, segment / seconds);
      displacement = Math.max(displacement, distance(points[0], p));
      if (segment > 250 && seconds < 5) teleport = true;
    }
  }
  const signals: string[] = [];
  if (maxSpeedMps > 5.2) signals.push("vehicle_speed_detected");
  if (teleport) signals.push("gps_teleport_jump");
  if (points.length < 4) signals.push("insufficient_path_points");
  if (displacement < distance(origin, destination) * 0.4) signals.push("stationary_trace");
  if (points.length && distance(origin, points[0]) > Math.max(100, quest.targetRadiusMeters + (points[0].accuracyM ?? 0))) signals.push("origin_mismatch");
  if (points.length && Math.abs(points[points.length - 1].timestamp - arrivalCapturedAt) > 60_000) signals.push("arrival_photo_time_mismatch");
  if (minDistanceToDestMeters > quest.targetRadiusMeters) signals.push("missed_destination");
  if (submittedAt > quest.expiresAt || arrivalCapturedAt > quest.expiresAt || (points.length && points[points.length - 1].timestamp > quest.expiresAt)) signals.push("expired_window");
  const spoof = signals.some(s => ["vehicle_speed_detected", "gps_teleport_jump", "insufficient_path_points", "stationary_trace", "origin_mismatch", "arrival_photo_time_mismatch"].includes(s));
  const verdict = signals.includes("expired_window") ? "failed_habit" : spoof ? "failed_spoof" : signals.length ? "failed_habit" : "passed";
  return { totalDistanceMeters, minDistanceToDestMeters, maxSpeedMps, durationSeconds: points.length > 1 ? (points[points.length - 1].timestamp - points[0].timestamp) / 1000 : 0, spoofSignals: signals, verdict, trustScore: verdict === "passed" ? 92 : spoof ? 16 : 45 } as const;
}

export const submitWalkTrace = mutation({
  args: { sidequestId: v.id("sidequests"), userId: v.id("users"), points: v.array(point), arrivalStorageId: v.id("_storage"), arrivalCapturedAt: v.number(), gyroVariance: v.optional(v.number()), screenGlareSuspected: v.optional(v.boolean()) },
  handler: async (ctx, { sidequestId, userId, points, arrivalStorageId, arrivalCapturedAt, gyroVariance, screenGlareSuspected }) => {
    const quest = await ctx.db.get(sidequestId);
    if (!quest || quest.userId !== userId) throw new Error("Sidequest not found for user");
    const existing = await ctx.db.query("walkSubmissions").withIndex("by_sidequest", q => q.eq("sidequestId", sidequestId)).unique();
    if (existing) return existing._id;
    const now = Date.now();
    const pot = await ctx.db.get(quest.potId);
    const member = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", quest.potId).eq("userId", userId)).unique();
    if (quest.status !== "active" || now < quest.startsAt || !pot || pot.status !== "active" || pot.currentDayIndex !== quest.dayIndex || now >= pot.nextDeadlineAt || !member || member.stakeStatus !== "funded") throw new Error("Sidequest or membership is not active");
    validatePoints(points, quest.startsAt, now);
    if (!Number.isFinite(arrivalCapturedAt) || arrivalCapturedAt < quest.startsAt || arrivalCapturedAt > quest.expiresAt || arrivalCapturedAt > now || (gyroVariance !== undefined && (!Number.isFinite(gyroVariance) || gyroVariance < 0))) throw new Error("Invalid arrival telemetry");
    const photo = await ctx.db.system.get(arrivalStorageId);
    if (!photo || !photo.contentType?.startsWith("image/") || photo.size === 0 || photo.size > 10_000_000) throw new Error("Arrival photo not found or invalid");
    const arrivalImageUrl = await ctx.storage.getUrl(arrivalStorageId);
    if (!arrivalImageUrl) throw new Error("Arrival photo not found");
    const submissions = await ctx.db.query("submissions").withIndex("by_pot_user_day", q => q.eq("potId", quest.potId).eq("userId", userId).eq("dayIndex", quest.dayIndex)).collect();
    if (member.completedDays.includes(quest.dayIndex) || submissions.some(s => s.verdict === "pending" || s.verdict === "passed")) throw new Error("Already submitted for this day");
    const challengeId = await ctx.db.insert("challenges", { potId: quest.potId, userId, dayIndex: quest.dayIndex, habitCategory: pot.habitCategory, promptText: quest.instruction, verificationCode: String(quest._id), issuedAt: quest.startsAt, expiresAt: quest.expiresAt, status: "consumed" });
    const feedSubmissionId = await ctx.db.insert("submissions", { potId: quest.potId, userId, dayIndex: quest.dayIndex, challengeId, storageId: arrivalStorageId, imageUrl: arrivalImageUrl, capturedAt: arrivalCapturedAt, uploadedAt: now, gyroVariance: gyroVariance ?? 0, screenGlareSuspected: screenGlareSuspected ?? false, verdict: "pending", spoofSignals: [], roastPersona: pot.roastPersona });
    const id = await ctx.db.insert("walkSubmissions", { sidequestId, potId: quest.potId, userId, dayIndex: quest.dayIndex, points, arrivalStorageId, arrivalImageUrl, arrivalCapturedAt, gyroVariance, screenGlareSuspected, feedSubmissionId, totalDistanceMeters: 0, durationSeconds: 0, minDistanceToDestMeters: 0, maxSpeedMps: 0, verdict: "pending", trustScore: 0, spoofSignals: [], roastPersona: pot.roastPersona, roastMessage: "", evaluationMode: "fallback", submittedAt: now });
    await ctx.scheduler.runAfter(0, anyApi.mapReferee.evaluateWalkTrace, { walkSubmissionId: id });
    return id;
  },
});

type LiveResult = { landmarkPassed: boolean; visualSpoofDetected: boolean; visualSpoofReasons: string[]; confidence: number; roastMessage: string };

export const getWalkContext = internalQuery({
  args: { walkSubmissionId: v.id("walkSubmissions") },
  handler: async (ctx, { walkSubmissionId }) => {
    const walk = await ctx.db.get(walkSubmissionId);
    if (!walk || walk.verdict !== "pending") return null;
    const [quest, pot] = await Promise.all([ctx.db.get(walk.sidequestId), ctx.db.get(walk.potId)]);
    if (!quest || !pot) return null;
    return { walk, quest, pot, imageUrl: await ctx.storage.getUrl(walk.arrivalStorageId) };
  },
});

function parseLive(value: unknown): LiveResult {
  if (!value || typeof value !== "object") throw new Error("Invalid visual assessment");
  const result = value as Record<string, unknown>;
  if (typeof result.landmarkPassed !== "boolean" || typeof result.visualSpoofDetected !== "boolean" ||
      !Array.isArray(result.visualSpoofReasons) || result.visualSpoofReasons.length > 20 || !result.visualSpoofReasons.every(s => typeof s === "string" && s.length <= 100) ||
      typeof result.confidence !== "number" || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1 ||
      typeof result.roastMessage !== "string" || !result.roastMessage.trim() || result.roastMessage.length > 1000) throw new Error("Invalid visual assessment");
  return result as LiveResult;
}

async function evaluatePhoto(context: { walk: Doc<"walkSubmissions">; quest: Doc<"sidequests">; imageUrl: string }, signal: AbortSignal): Promise<LiveResult> {
  const { walk, quest, imageUrl } = context;
  const gps = assess(walk.points, quest, walk.submittedAt, walk.arrivalCapturedAt);
  const prompt = `Verify the arrival photo for a walking sidequest to ${quest.destName}. Destination description: ${quest.destSummary}. Mission: ${quest.instruction}. GPS distance to destination: ${Math.round(gps.minDistanceToDestMeters)}m, target radius: ${quest.targetRadiusMeters}m; GPS flags: ${gps.spoofSignals.join(", ") || "none"}. Decide whether the photo credibly shows the destination and whether there are signs of photo spoofing. Return only JSON with landmarkPassed (boolean), visualSpoofDetected (boolean), visualSpoofReasons (array of concise strings), confidence (0 to 1), and roastMessage (short playful string). ${ROAST_PERSONAS[walk.roastPersona].systemInstruction}`;
  if (process.env.GEMINI_API_KEY) {
    const image = await fetch(imageUrl, { signal });
    if (!image.ok) throw new Error("Photo fetch failed");
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.length > 10_000_000) throw new Error("Photo too large");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_VLM_MODEL || "gemini-2.5-flash")}:generateContent`, {
      method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: image.headers.get("content-type")?.split(";")[0] || "image/jpeg", data: btoa(binary) } }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    if (!response.ok) throw new Error("Visual assessment failed");
    const body = await response.json();
    return parseLive(JSON.parse(body.candidates[0].content.parts[0].text));
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_VLM_MODEL || "gpt-4o-mini", response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageUrl } }] }] }),
  });
  if (!response.ok) throw new Error("Visual assessment failed");
  const body = await response.json();
  return parseLive(JSON.parse(body.choices[0].message.content));
}

export const finalizeWalkTrace = internalMutation({
  args: { walkSubmissionId: v.id("walkSubmissions"), live: v.optional(v.object({ landmarkPassed: v.boolean(), visualSpoofDetected: v.boolean(), visualSpoofReasons: v.array(v.string()), confidence: v.number(), roastMessage: v.string() })) },
  handler: async (ctx, { walkSubmissionId, live }) => {
    const walk = await ctx.db.get(walkSubmissionId);
    if (!walk) throw new Error("Walk submission not found");
    if (walk.verdict !== "pending") return false;
    const [quest, pot, user, feed, member] = await Promise.all([
      ctx.db.get(walk.sidequestId), ctx.db.get(walk.potId), ctx.db.get(walk.userId), ctx.db.get(walk.feedSubmissionId),
      ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", walk.potId).eq("userId", walk.userId)).unique(),
    ]);
    if (!quest || !pot || !user || !feed) throw new Error("Walk context not found");
    if (live) parseLive(live);
    const gps = assess(walk.points, quest, walk.submittedAt, walk.arrivalCapturedAt);
    const signals = [...gps.spoofSignals];
    if (walk.screenGlareSuspected) signals.push("screen_glare");
    if (walk.gyroVariance !== undefined && walk.gyroVariance < 0.015) signals.push("low_motion");
    if (live?.visualSpoofDetected) signals.push("visual_spoof_detected", ...live.visualSpoofReasons.filter(Boolean));
    if (live && !live.landmarkPassed) signals.push("landmark_not_verified");
    const eligible = pot.status === "active" && pot.currentDayIndex === walk.dayIndex && Date.now() < pot.nextDeadlineAt && member?.stakeStatus === "funded" && (quest.status === "active" || (quest.status === "failed_timeout" && walk.submittedAt <= quest.expiresAt));
    if (!eligible && !signals.includes("expired_window")) signals.push("expired_window");
    const spoof = gps.verdict === "failed_spoof" || !!walk.screenGlareSuspected || (walk.gyroVariance !== undefined && walk.gyroVariance < 0.015) || !!live?.visualSpoofDetected;
    const verdict = signals.includes("expired_window") ? "failed_habit" : spoof ? "failed_spoof" : gps.verdict !== "passed" || (live && !live.landmarkPassed) ? "failed_habit" : "passed";
    const spoofSignals = [...new Set(signals)];
    const nextDays = verdict === "passed" && member && !member.completedDays.includes(walk.dayIndex) ? [...member.completedDays, walk.dayIndex] : member?.completedDays ?? [];
    let streak = 0;
    for (let day = walk.dayIndex; nextDays.includes(day); day--) streak++;
    const details = verdict === "passed" ? `reached ${quest.destName} after ${Math.round(gps.totalDistanceMeters)}m` : `${quest.destName}: ${spoofSignals.join(", ")} (top speed ${Math.round(gps.maxSpeedMps * 3.6)} km/h)`;
    const photoVerdict = live?.visualSpoofDetected ? "failed_spoof" : live?.landmarkPassed ? "passed" : "failed_habit";
    const roast = live && verdict === photoVerdict && !signals.includes("expired_window") ? `${user.name}: ${live.roastMessage.trim()}` : ROAST_PERSONAS[walk.roastPersona].buildFallbackRoast({ verdict, userName: user.name, habitPrompt: quest.instruction, spoofSignals: [details], streakCount: streak });
    const roastMessage = `${roast} ${details}.`;
    const trustScore = verdict === "passed" ? live ? Math.round(live.confidence * 100) : 92 : verdict === "failed_spoof" ? 16 : 45;
    const evaluationMode = live ? "live" : "fallback";
    await ctx.db.patch(walkSubmissionId, { totalDistanceMeters: gps.totalDistanceMeters, durationSeconds: gps.durationSeconds, minDistanceToDestMeters: gps.minDistanceToDestMeters, maxSpeedMps: gps.maxSpeedMps, verdict, trustScore, spoofSignals, roastMessage, evaluationMode });
    await ctx.db.patch(feed._id, { verdict, trustScore, spoofSignals, roastMessage, evaluationMode });
    if (quest.status === "active" || quest.status === "failed_timeout") await ctx.db.patch(quest._id, { status: verdict === "passed" ? "completed" : verdict === "failed_spoof" ? "failed_spoof" : "failed_timeout", ...(verdict === "passed" ? { completedAt: walk.arrivalCapturedAt } : {}) });
    if (verdict === "passed" && member && !member.completedDays.includes(walk.dayIndex)) await ctx.db.patch(member._id, { completedDays: nextDays, streakCount: streak, lastSubmittedDayIndex: walk.dayIndex });
    await ctx.scheduler.runAfter(0, anyApi.whop.postChatAnnouncement, { potId: walk.potId, message: roastMessage });
    return true;
  },
});

export const evaluateWalkTrace = internalAction({
  args: { walkSubmissionId: v.id("walkSubmissions") },
  handler: async (ctx, args): Promise<boolean> => {
    const context = await ctx.runQuery(anyApi.mapReferee.getWalkContext, args) as { walk: Doc<"walkSubmissions">; quest: Doc<"sidequests">; pot: Doc<"pots">; imageUrl: string | null } | null;
    if (!context) return false;
    let live: LiveResult | undefined;
    const demo = ["demo_whop_product_gym_pact", "demo_whop_product_sidequest"].includes(context.pot.whopProductId ?? "");
    if (!demo && context.imageUrl && (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)) {
      const signal = AbortSignal.timeout(5500);
      try {
        live = await Promise.race([
          evaluatePhoto({ ...context, imageUrl: context.imageUrl }, signal),
          new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("Visual assessment timed out")), { once: true })),
        ]);
      } catch { live = undefined; }
    }
    return await ctx.runMutation(anyApi.mapReferee.finalizeWalkTrace, { ...args, live });
  },
});
