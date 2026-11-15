import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const now = Date.UTC(2026, 0, 5, 6);
type Point = { lat: number; lng: number; timestamp: number; speedMps?: number; accuracyM?: number };

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { name: "Taylor", handle: "taylor", simulatedWalletBalanceCents: 0, createdAt: now });
    const otherUserId = await ctx.db.insert("users", { name: "Sam", handle: "sam", simulatedWalletBalanceCents: 0, createdAt: now });
    const potId = await ctx.db.insert("pots", { title: "Walk", habitCategory: "fitness", habitPrompt: "Walk", stakeCents: 1000, status: "active", roastPersona: "drill_sergeant", currentDayIndex: 2, dailyCutoffHourUtc: 12, nextDeadlineAt: now + 3_600_000, potTotalCents: 1000, forfeitedCents: 0, createdByUserId: userId, createdAt: now });
    const memberId = await ctx.db.insert("memberships", { potId, userId, stakeStatus: "funded", streakCount: 1, completedDays: [1], missedDays: [], joinedAt: now });
    const sidequestId = await ctx.db.insert("sidequests", { potId, userId, dayIndex: 2, status: "active", title: "Walk to the tower", instruction: "Walk to the tower", originLat: 37, originLng: -122, destLat: 37.008, destLng: -122, destName: "Tower", destSummary: "A tower", destSource: "curated_fallback", distanceMeters: 890, allottedMinutes: 20, targetRadiusMeters: 65, warningSentAt: now - 1_200_000, startsAt: now - 900_000, expiresAt: now + 300_000 });
    const arrivalStorageId = await ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" }));
    return { potId, userId, otherUserId, memberId, sidequestId, arrivalStorageId };
  });
  const points: Point[] = [0, 1, 2, 3, 4].map(i => ({ lat: 37 + i * 0.002, lng: -122, timestamp: now - 900_000 + i * 225_000 }));
  const args = { sidequestId: ids.sidequestId, userId: ids.userId, points, arrivalStorageId: ids.arrivalStorageId, arrivalCapturedAt: now };
  return { t, ...ids, points, args };
}

async function evaluate(t: Awaited<ReturnType<typeof setup>>["t"], id: Id<"walkSubmissions">) {
  return await t.action(internal.mapReferee.evaluateWalkTrace, { walkSubmissionId: id });
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv("GEMINI_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", ""); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("map and arrival photo referee", () => {
  it("reserves a pending feed item, then credits and announces a genuine walk exactly once", async () => {
    const { t, sidequestId, memberId, args, arrivalStorageId } = await setup();
    const id = await t.mutation(api.mapReferee.submitWalkTrace, args);
    expect(await t.mutation(api.mapReferee.submitWalkTrace, args)).toBe(id);
    const pending = await t.run(async ctx => ({ walk: await ctx.db.get(id), feed: await ctx.db.query("submissions").collect(), member: await ctx.db.get(memberId) }));
    expect(pending.walk).toMatchObject({ verdict: "pending", arrivalStorageId });
    expect(pending.feed[0]).toMatchObject({ verdict: "pending", storageId: arrivalStorageId, capturedAt: now });
    expect(pending.feed[0].imageUrl).toBeTruthy();
    expect(pending.member?.completedDays).toEqual([1]);
    expect(await evaluate(t, id)).toBe(true);
    expect(await evaluate(t, id)).toBe(false);
    const state = await t.run(async ctx => ({ walk: await ctx.db.get(id), member: await ctx.db.get(memberId), quest: await ctx.db.get(sidequestId), feed: await ctx.db.query("submissions").collect(), challenges: await ctx.db.query("challenges").collect(), jobs: await ctx.db.system.query("_scheduled_functions").collect() }));
    expect(state.walk).toMatchObject({ verdict: "passed", spoofSignals: [], durationSeconds: 900, evaluationMode: "fallback" });
    expect(state.walk!.totalDistanceMeters).toBeGreaterThan(850);
    expect(state.walk!.roastMessage).toContain("Tower");
    expect(state.member).toMatchObject({ completedDays: [1, 2], streakCount: 2, lastSubmittedDayIndex: 2 });
    expect(state.quest).toMatchObject({ status: "completed", completedAt: now });
    expect(state.feed).toHaveLength(1);
    expect(state.feed[0]).toMatchObject({ verdict: "passed", challengeId: state.challenges[0]._id });
    expect(state.challenges[0].status).toBe("consumed");
    expect(state.jobs).toHaveLength(2);
  });

  it.each([
    ["car speed", (p: Point[]) => p.map((v, i) => ({ ...v, speedMps: i === 2 ? 14 : 1 })), "vehicle_speed_detected"],
    ["teleport", (p: Point[]) => p.map((v, i) => i === 3 ? { ...v, lat: 37.008, timestamp: p[2].timestamp + 1000 } : v), "gps_teleport_jump"],
    ["missed destination", (p: Point[]) => p.map((v, i) => ({ ...v, lat: 37 + i * 0.001 })), "missed_destination"],
    ["stationary", (p: Point[]) => p.map(v => ({ ...v, lat: 37 })), "stationary_trace"],
    ["too few points", (p: Point[]) => p.slice(0, 3), "insufficient_path_points"],
  ])("rejects %s", async (_name, transform, signal) => {
    const { t, memberId, points, args } = await setup();
    const id = await t.mutation(api.mapReferee.submitWalkTrace, { ...args, points: transform(points) });
    await evaluate(t, id);
    const [walk, member] = await t.run(async ctx => [await ctx.db.get(id), await ctx.db.get(memberId)]);
    expect(walk!.spoofSignals).toContain(signal);
    expect(walk!.verdict).not.toBe("passed");
    expect(member!.completedDays).toEqual([1]);
  });

  it("treats screen glare and low motion as spoofing even in fallback mode", async () => {
    const { t, args } = await setup();
    const id = await t.mutation(api.mapReferee.submitWalkTrace, { ...args, gyroVariance: 0.001, screenGlareSuspected: true });
    await evaluate(t, id);
    expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ verdict: "failed_spoof", spoofSignals: expect.arrayContaining(["low_motion", "screen_glare"]), evaluationMode: "fallback" });
  });

  it("prioritizes expired submission over spoof signals", async () => {
    const { t, sidequestId, points, args } = await setup();
    await t.run(async ctx => ctx.db.patch(sidequestId, { expiresAt: now - 1 }));
    const id = await t.mutation(api.mapReferee.submitWalkTrace, { ...args, arrivalCapturedAt: now - 2, points: points.map((p, i) => ({ ...p, lat: 37, timestamp: i === 4 ? now - 2 : p.timestamp })) });
    await evaluate(t, id);
    expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ verdict: "failed_habit", spoofSignals: expect.arrayContaining(["expired_window", "stationary_trace"]) });
  });

  it("validates photo, ownership, funding and telemetry before scheduling", async () => {
    const { t, otherUserId, memberId, points, args } = await setup();
    const badStorage = await t.run(async ctx => ctx.storage.store(new Blob(["not image"], { type: "text/plain" })));
    const deletedStorage = await t.run(async ctx => { const id = await ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" })); await ctx.storage.delete(id); return id; });
    for (const [index, bad] of [
      { ...args, userId: otherUserId }, { ...args, arrivalStorageId: badStorage }, { ...args, arrivalStorageId: deletedStorage },
      { ...args, arrivalCapturedAt: now + 60_000 }, { ...args, arrivalCapturedAt: now - 900_001 },
      { ...args, gyroVariance: NaN }, { ...args, points: points.map((p, i) => i === 1 ? { ...p, lat: NaN } : p) },
      { ...args, points: points.map((p, i) => i === 1 ? { ...p, timestamp: points[0].timestamp } : p) },
      { ...args, points: Array(1001).fill(points[0]) },
    ].entries()) {
      const rejected = await t.mutation(api.mapReferee.submitWalkTrace, bad).then(() => false, () => true);
      expect(rejected, `invalid case ${index}`).toBe(true);
    }
    await t.run(async ctx => ctx.db.patch(args.sidequestId, { expiresAt: now - 1 }));
    await expect(t.mutation(api.mapReferee.submitWalkTrace, args)).rejects.toThrow();
    await t.run(async ctx => { await ctx.db.patch(args.sidequestId, { expiresAt: now + 300_000 }); await ctx.db.patch(memberId, { stakeStatus: "pending_checkout" }); });
    await expect(t.mutation(api.mapReferee.submitWalkTrace, args)).rejects.toThrow();
    expect(await t.run(async ctx => ctx.db.query("walkSubmissions").collect())).toHaveLength(0);
  });

  it("never awards after cutoff while evaluation is pending", async () => {
    const { t, potId, memberId, args } = await setup();
    const id = await t.mutation(api.mapReferee.submitWalkTrace, args);
    await t.run(async ctx => ctx.db.patch(potId, { nextDeadlineAt: now }));
    await evaluate(t, id);
    expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ verdict: "failed_habit", spoofSignals: expect.arrayContaining(["expired_window"]) });
    expect((await t.run(async ctx => ctx.db.get(memberId)))!.completedDays).toEqual([1]);
  });

  it("protects a timely pending submission against the quest timeout job", async () => {
    const { t, sidequestId, args } = await setup();
    await t.run(async ctx => ctx.db.patch(sidequestId, { expiresAt: now + 1000 }));
    const id = await t.mutation(api.mapReferee.submitWalkTrace, args);
    vi.setSystemTime(now + 2000);
    expect(await t.mutation(internal.sidequests.timeoutSidequest, { sidequestId })).toBe(false);
    await evaluate(t, id);
    expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ verdict: "passed" });
  });

  it("uses the image and GPS in a live VLM assessment, but never lets it override GPS spoofing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ choices: [{ message: { content: JSON.stringify({ landmarkPassed: true, visualSpoofDetected: false, visualSpoofReasons: [], confidence: 0.99, roastMessage: "Nice walk" }) } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, args, points } = await setup();
    const id = await t.mutation(api.mapReferee.submitWalkTrace, { ...args, points: points.map(p => ({ ...p, speedMps: 14 })) });
    await evaluate(t, id);
    expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ verdict: "failed_spoof", evaluationMode: "live", spoofSignals: expect.arrayContaining(["vehicle_speed_detected"]) });
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(JSON.stringify(body)).toContain("Tower");
    expect(JSON.stringify(body)).toContain("GPS distance");
    expect(JSON.stringify(body)).toContain("image_url");
  });

  it.each([
    [true, false, "passed", []],
    [false, false, "failed_habit", ["landmark_not_verified"]],
    [true, true, "failed_spoof", ["visual_spoof_detected", "screen_replay"]],
  ] as const)("applies the live landmark=%s spoof=%s verdict to a valid walk", async (landmarkPassed, visualSpoofDetected, verdict, signals) => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ landmarkPassed, visualSpoofDetected, visualSpoofReasons: visualSpoofDetected ? ["screen_replay"] : [], confidence: 0.88, roastMessage: "Live persona roast" }) } }] })));
    const { t, args, memberId } = await setup();
    const id = await t.mutation(api.mapReferee.submitWalkTrace, args);
    await evaluate(t, id);
    const [walk, member] = await t.run(async ctx => [await ctx.db.get(id), await ctx.db.get(memberId)]);
    expect(walk).toMatchObject({ verdict, evaluationMode: "live", spoofSignals: expect.arrayContaining([...signals]), roastMessage: expect.stringContaining("Live persona roast") });
    expect(member!.completedDays).toEqual(verdict === "passed" ? [1, 2] : [1]);
  });

  it("sends image bytes and destination details to Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).includes("generativelanguage.googleapis.com")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ landmarkPassed: true, visualSpoofDetected: false, visualSpoofReasons: [], confidence: 0.9, roastMessage: "Mission complete" }) }] } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { t, args } = await setup();
    const id = await t.mutation(api.mapReferee.submitWalkTrace, args);
    await evaluate(t, id);
    expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ verdict: "passed", evaluationMode: "live" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back when VLM times out and uses no network for demo pots", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(delay => { setTimeout(() => controller.abort(), delay); return controller.signal; });
    let started!: () => void;
    const called = new Promise<void>(resolve => { started = resolve; });
    const fetchMock = vi.fn(() => { started(); return new Promise<Response>(() => {}); });
    vi.stubGlobal("fetch", fetchMock);
    const { t, args } = await setup();
    const id = await t.mutation(api.mapReferee.submitWalkTrace, args);
    const pending = evaluate(t, id);
    await called;
    await vi.advanceTimersByTimeAsync(5500);
    await pending;
    expect(await t.run(async ctx => ctx.db.get(id))).toMatchObject({ verdict: "passed", evaluationMode: "fallback" });
    const callsBeforeDemo = fetchMock.mock.calls.length;
    const second = await setup();
    await second.t.run(async ctx => ctx.db.patch(second.potId, { whopProductId: "demo_whop_product_sidequest" }));
    const demoId = await second.t.mutation(api.mapReferee.submitWalkTrace, second.args);
    await evaluate(second.t, demoId);
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeDemo);
    expect(await second.t.run(async ctx => ctx.db.get(demoId))).toMatchObject({ verdict: "passed", evaluationMode: "fallback" });
  });
});
