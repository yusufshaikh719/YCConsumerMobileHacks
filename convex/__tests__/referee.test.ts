import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { PERSONA_IDS, type HabitCategory, type PersonaId } from "../lib/contracts";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const now = Date.UTC(2026, 0, 5, 6);
type Backend = TestConvex<typeof schema>;

async function setup(t: Backend, category: HabitCategory = "fitness", persona: PersonaId = "drill_sergeant") {
  const userId = await t.run(async (ctx) => ctx.db.insert("users", {
    name: "Taylor", handle: "taylor", simulatedWalletBalanceCents: 0, createdAt: now,
  }));
  const potId = await t.mutation(api.pots.createPot, {
    title: "Daily habit", habitCategory: category, habitPrompt: "Practice my daily routine",
    createdByUserId: userId, roastPersona: persona,
  });
  await t.mutation(api.pots.joinPotPendingCheckout, { potId, userId });
  await t.mutation(internal.pots.confirmWhopStake, {
    potId, userId, whopPaymentId: "payment", eventId: "event", mode: "simulated",
  });
  return { userId, potId };
}

async function submission(t: Backend, options: {
  persona?: PersonaId;
  gyroVariance?: number;
  screenGlareSuspected?: boolean;
  captureLatency?: number;
  imageUrl?: string;
} = {}) {
  const { potId, userId } = await setup(t, "fitness", options.persona);
  const challengeId = await t.mutation(api.challenges.issueCameraChallenge, { potId, userId });
  const submissionId = await t.run(async (ctx) => ctx.db.insert("submissions", {
    potId, userId, challengeId, dayIndex: 1, imageUrl: options.imageUrl ?? "https://proof.example/image.jpg",
    capturedAt: now - (options.captureLatency ?? 1000), uploadedAt: now,
    gyroVariance: options.gyroVariance ?? 0.2, screenGlareSuspected: options.screenGlareSuspected ?? false,
    verdict: "pending", spoofSignals: [], roastPersona: options.persona ?? "drill_sergeant",
  }));
  return { potId, userId, challengeId, submissionId };
}

async function evaluate(t: Backend, submissionId: Id<"submissions">) {
  await t.action(internal.referee.evaluateSubmissionProof, { submissionId });
  return await t.run(async (ctx) => ctx.db.get(submissionId));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("camera challenges", () => {
  it.each([
    ["fitness", /gym|weight|equipment|exercise|fitness|treadmill|dumbbell|rack/i],
    ["coding", /code|editor|terminal|paper|sticky/i],
    ["wakeup", /water|mug|toothbrush|bathroom|kitchen|bed/i],
    ["custom", /practice my daily routine/i],
  ] as const)("issues a short-lived, habit-aware %s challenge", async (category, prompt) => {
    const t = convexTest(schema, modules);
    const { potId, userId } = await setup(t, category);
    const challengeId = await t.mutation(api.challenges.issueCameraChallenge, { potId, userId });
    const challenge = await t.query(api.challenges.getChallenge, { challengeId });
    expect(challenge).toMatchObject({ potId, userId, habitCategory: category, status: "issued" });
    expect(challenge!.expiresAt - challenge!.issuedAt).toBe(60_000);
    expect(challenge?.verificationCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{3}$/);
    expect(challenge?.promptText).toMatch(prompt);
    expect(challenge?.promptText).toContain(challenge!.verificationCode);
    expect(await t.query(api.challenges.getActiveChallenge, { potId, userId })).toMatchObject({ _id: challengeId });
    expect(await t.mutation(api.challenges.issueCameraChallenge, { potId, userId })).toBe(challengeId);
  });

  it("rotates near-expiry and expired challenges and caps expiry at the daily deadline", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId } = await setup(t);
    const first = await t.mutation(api.challenges.issueCameraChallenge, { potId, userId });
    const firstChallenge = await t.query(api.challenges.getChallenge, { challengeId: first });
    vi.setSystemTime(firstChallenge!.issuedAt + 45_000);
    const second = await t.mutation(api.challenges.issueCameraChallenge, { potId, userId });
    expect(second).not.toBe(first);
    const secondChallenge = await t.query(api.challenges.getChallenge, { challengeId: second });
    vi.setSystemTime(secondChallenge!.expiresAt);
    const third = await t.mutation(api.challenges.issueCameraChallenge, { potId, userId });
    expect(third).not.toBe(second);
    expect(await t.query(api.challenges.getChallenge, { challengeId: first })).toMatchObject({ status: "expired" });
    expect(await t.query(api.challenges.getChallenge, { challengeId: second })).toMatchObject({ status: "expired" });
    const other = convexTest(schema, modules);
    const otherPot = await setup(other);
    const deadline = Date.now() + 10_000;
    await other.run(async (ctx) => ctx.db.patch(otherPot.potId, { nextDeadlineAt: deadline }));
    const fourth = await other.mutation(api.challenges.issueCameraChallenge, otherPot);
    expect(await other.query(api.challenges.getChallenge, { challengeId: fourth })).toMatchObject({ expiresAt: deadline });
    vi.setSystemTime(deadline);
    await expect(other.mutation(api.challenges.issueCameraChallenge, otherPot)).rejects.toThrow();
  });
});

describe("referee fallback", () => {
  it.each(PERSONA_IDS)("evaluates clean and suspicious telemetry for %s", async (persona) => {
    const roasts = [];
    for (const test of [
      { options: {}, verdict: "passed", trustScore: 92, signals: [] },
      { options: { screenGlareSuspected: true }, verdict: "failed_spoof", trustScore: 16, signals: ["screen_glare"] },
      { options: { gyroVariance: 0.014 }, verdict: "failed_spoof", trustScore: 16, signals: ["low_motion"] },
    ]) {
      const t = convexTest(schema, modules);
      const { submissionId, potId, userId } = await submission(t, { ...test.options, persona });
      const result = await evaluate(t, submissionId);
      expect(result).toMatchObject({ verdict: test.verdict, trustScore: test.trustScore, spoofSignals: test.signals, evaluationMode: "fallback" });
      expect(result?.roastMessage).toMatch(/taylor/i);
      expect(result?.roastMessage?.length).toBeGreaterThan(15);
      const member = await t.run(async (ctx) => ctx.db.query("memberships").withIndex("by_pot_user", (q) => q.eq("potId", potId).eq("userId", userId)).unique());
      expect(member?.completedDays).toEqual(test.verdict === "passed" ? [1] : []);
      roasts.push(result?.roastMessage);
    }
    expect(new Set(roasts).size).toBe(3);
  });

  it("keeps the motion threshold strict and includes every detected spoof signal", async () => {
    const t = convexTest(schema, modules);
    const clean = await submission(t, { gyroVariance: 0.015 });
    expect(await evaluate(t, clean.submissionId)).toMatchObject({ verdict: "passed", spoofSignals: [] });
    const second = convexTest(schema, modules);
    const suspicious = await submission(second, { gyroVariance: 0.014, screenGlareSuspected: true });
    const result = await evaluate(second, suspicious.submissionId);
    expect(result?.verdict).toBe("failed_spoof");
    expect(result?.spoofSignals).toEqual(expect.arrayContaining(["low_motion", "screen_glare"]));
  });
});

const responses = [
  { verdict: "passed", habitPassed: true, challengePassed: true, visualSpoofDetected: false, visualSpoofReasons: [] },
  { verdict: "failed_habit", habitPassed: false, challengePassed: true, visualSpoofDetected: false, visualSpoofReasons: [] },
  { verdict: "failed_habit", habitPassed: true, challengePassed: false, visualSpoofDetected: false, visualSpoofReasons: [] },
  { verdict: "failed_spoof", habitPassed: true, challengePassed: true, visualSpoofDetected: true, visualSpoofReasons: ["monitor_bezel"] },
] as const;

describe.each(["openai", "gemini"] as const)("live %s referee", (provider) => {
  it.each(responses)("persists $verdict from the provider response", async (response) => {
    vi.stubEnv(provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY", "test-key");
    const payload = JSON.stringify({ ...response, confidence: 0.91, roastMessage: "Your streak lives another day." });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "https://proof.example/image.jpg") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      if (provider === "openai" && url.includes("api.openai.com")) return Response.json({ choices: [{ message: { content: payload } }] });
      if (provider === "gemini" && url.includes("generativelanguage.googleapis.com")) return Response.json({ candidates: [{ content: { parts: [{ text: payload }] } }] });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const { submissionId, challengeId } = await submission(t);
    const result = await evaluate(t, submissionId);
    expect(result).toMatchObject({ verdict: response.verdict, evaluationMode: "live" });
    expect(result?.trustScore).toBeGreaterThanOrEqual(0);
    expect(result?.trustScore).toBeLessThanOrEqual(100);
    expect(result?.roastMessage).toMatch(/taylor/i);
    if (response.visualSpoofDetected) expect(result?.spoofSignals).toContain("monitor_bezel");
    const providerCall = fetchMock.mock.calls.find(([url]) => String(url).includes(provider === "openai" ? "api.openai.com" : "generativelanguage.googleapis.com"));
    expect(providerCall).toBeDefined();
    const challenge = await t.run(async (ctx) => ctx.db.get(challengeId));
    const requestBody = String(providerCall?.[1]?.body);
    expect(requestBody).toContain("Practice my daily routine");
    expect(requestBody).toContain(challenge!.verificationCode);
    expect(requestBody).toContain(challenge!.promptText);
    expect(requestBody).toContain("gyroVariance");
    expect(requestBody).toContain("screenGlareSuspected");
    expect(providerCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    const parsed = JSON.parse(requestBody);
    if (provider === "openai") {
      expect(parsed).toMatchObject({ model: "gpt-4o-mini", response_format: { type: "json_object" } });
      expect(parsed.messages[1].content[1].image_url.url).toBe("https://proof.example/image.jpg");
    } else {
      expect(parsed.generationConfig.responseMimeType).toBe("application/json");
      expect(parsed.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
      expect(fetchMock.mock.calls[0][1]?.signal).toBe(providerCall?.[1]?.signal);
    }
  });
});

describe("provider failures", () => {
  it.each(["HTTP 500", "malformed JSON", "timeout"])("falls back without throwing on %s", async (failure) => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => {
      if (failure === "timeout") throw new DOMException("Timed out", "TimeoutError");
      if (failure === "HTTP 500") return new Response("unavailable", { status: 500 });
      return Response.json({ choices: [{ message: { content: "not json" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const { submissionId } = await submission(t, { screenGlareSuspected: true });
    expect(await evaluate(t, submissionId)).toMatchObject({ verdict: "failed_spoof", evaluationMode: "fallback", trustScore: 16, spoofSignals: ["screen_glare"] });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("aborts a never-resolving provider call after 5.5 seconds", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((delay) => {
      setTimeout(() => controller.abort(), delay);
      return controller.signal;
    });
    let started!: () => void;
    const called = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal("fetch", vi.fn(() => {
      started();
      return new Promise<Response>(() => {});
    }));
    const t = convexTest(schema, modules);
    const { submissionId } = await submission(t);
    let settled = false;
    const pending = evaluate(t, submissionId).then((result) => { settled = true; return result; });
    await called;
    expect(timeout).toHaveBeenCalledWith(5500);
    await vi.advanceTimersByTimeAsync(5499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ verdict: "passed", evaluationMode: "fallback", trustScore: 92 });
    expect(controller.signal.aborted).toBe(true);
  });
});

it("treats combined live telemetry as spoofing and deduplicates provider signals", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({
    habitPassed: true, challengePassed: true, visualSpoofDetected: false,
    visualSpoofReasons: ["screen_glare", "monitor_bezel", "monitor_bezel"], confidence: 1.5, roastMessage: "Suspicious evidence."
  }) } }] })));
  const t = convexTest(schema, modules);
  const { submissionId } = await submission(t, { gyroVariance: 0.01, screenGlareSuspected: true, captureLatency: 45_001 });
  const result = await evaluate(t, submissionId);
  expect(result).toMatchObject({ verdict: "failed_spoof", evaluationMode: "live", trustScore: 100 });
  expect(result?.spoofSignals).toEqual(expect.arrayContaining(["screen_glare", "low_motion", "capture_latency_anomaly", "monitor_bezel"]));
  expect(new Set(result?.spoofSignals).size).toBe(result?.spoofSignals.length);
});
