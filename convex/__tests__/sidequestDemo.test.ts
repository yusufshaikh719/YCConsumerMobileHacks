import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const now = Date.UTC(2026, 0, 5, 6);

describe("sidequest demo controls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("seeds separately and triggers a deterministic warning without network access", async () => {
    const t = convexTest(schema, modules);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("network used"); });
    const { potId, userId } = await t.mutation(api.demo.seedSidequestDemoPot, {});
    expect(await t.mutation(api.demo.seedSidequestDemoPot, {})).toEqual({ potId, userId });
    const args = { potId, userId, lat: 37.772, lng: -122.389 };
    const sidequestId = await t.mutation(api.demo.demoTrigger5MinWarning, args);
    expect(await t.mutation(api.demo.demoTrigger5MinWarning, args)).toBe(sidequestId);
    const quest = await t.run(ctx => ctx.db.get(sidequestId));
    expect(quest).toMatchObject({ potId, userId, status: "warning_5m", destName: "Oracle Park", destSource: "curated_fallback" });
    expect(quest!.warningSentAt).toBeGreaterThanOrEqual(now);
    expect(quest!.startsAt - quest!.warningSentAt).toBe(300_000);
    expect(quest!.distanceMeters).toBeGreaterThan(450);
    expect(quest!.distanceMeters).toBeLessThan(1450);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["valid_walk", "passed", "completed", undefined],
    ["uber_spoof", "failed_spoof", "failed_spoof", "vehicle_speed_detected"],
    ["screen_photo_spoof", "failed_spoof", "failed_spoof", "screen_glare"],
    ["couch_timeout", "failed_habit", "failed_timeout", "expired_window"],
  ] as const)("runs the %s scenario through the referee", async (mode, verdict, status, signal) => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("network used"); });
    const { potId, userId } = await t.mutation(api.demo.seedSidequestDemoPot, {});
    const sidequestId = await t.mutation(api.demo.demoTrigger5MinWarning, { potId, userId, lat: 37.772, lng: -122.389 });
    const walkId = await t.mutation(api.demo.demoSimulateWalkTrace, { sidequestId, mode });
    const pending = await t.run(ctx => ctx.db.get(walkId));
    expect(pending?.verdict).toBe("pending");
    expect(await t.run(ctx => ctx.db.get(pending!.feedSubmissionId))).toMatchObject({ verdict: "pending", storageId: pending!.arrivalStorageId });
    const image = await t.run(async ctx => {
      const blob = await ctx.storage.get(pending!.arrivalStorageId);
      const bytes = new Uint8Array(await blob!.arrayBuffer());
      return { type: blob!.type, start: Array.from(bytes.slice(0, 2)), end: Array.from(bytes.slice(-2)) };
    });
    expect(image).toEqual({ type: "image/jpeg", start: [0xff, 0xd8], end: [0xff, 0xd9] });
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
    const [quest, walk, member] = await t.run(async ctx => Promise.all([
      ctx.db.get(sidequestId), ctx.db.get(walkId),
      ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", potId).eq("userId", userId)).unique(),
    ]));
    expect(quest?.status).toBe(status);
    expect(walk?.verdict).toBe(verdict);
    expect(walk?.arrivalStorageId).toBe(pending?.arrivalStorageId);
    expect(walk!.arrivalCapturedAt).toBeLessThanOrEqual(quest!.expiresAt);
    expect(await t.run(ctx => ctx.db.get(walk!.feedSubmissionId))).toMatchObject({ verdict, storageId: walk!.arrivalStorageId });
    expect(walk?.points).toHaveLength(9);
    expect(walk?.points.at(-1)!.timestamp).toBeLessThanOrEqual(now);
    if (signal) expect(walk?.spoofSignals).toContain(signal);
    if (mode === "valid_walk") {
      expect(walk!.maxSpeedMps).toBeLessThan(5.2);
      expect(walk!.minDistanceToDestMeters).toBeLessThan(18);
      expect(member?.completedDays).toContain(1);
    }
    expect(fetch).not.toHaveBeenCalled();
    await expect(t.mutation(api.demo.demoSimulateWalkTrace, { sidequestId, mode })).rejects.toThrow();
  });

  it("refuses both controls for non-demo pots without changing their quest", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId } = await t.mutation(api.demo.seedSidequestDemoPot, {});
    const sidequestId = await t.mutation(api.demo.demoTrigger5MinWarning, { potId, userId, lat: 37.772, lng: -122.389 });
    await t.run(ctx => ctx.db.patch(potId, { whopProductId: "real_product" }));
    const before = await t.run(ctx => ctx.db.get(sidequestId));
    await expect(t.mutation(api.demo.demoTrigger5MinWarning, { potId, userId, lat: 37.772, lng: -122.389 })).rejects.toThrow("Demo pot");
    await expect(t.mutation(api.demo.demoSimulateWalkTrace, { sidequestId, mode: "valid_walk" })).rejects.toThrow("Demo pot");
    expect(await t.run(ctx => ctx.db.get(sidequestId))).toEqual(before);
    expect(await t.run(ctx => ctx.db.query("walkSubmissions").collect())).toEqual([]);
  });

  it("does not let the legacy demo override a pending walk verdict", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId } = await t.mutation(api.demo.seedSidequestDemoPot, {});
    await t.run(ctx => ctx.db.patch(potId, { whopProductId: "demo_whop_product_gym_pact" }));
    const sidequestId = await t.mutation(api.demo.demoTrigger5MinWarning, { potId, userId, lat: 37.772, lng: -122.389 });
    const walkId = await t.mutation(api.demo.demoSimulateWalkTrace, { sidequestId, mode: "uber_spoof" });
    const walk = await t.run(ctx => ctx.db.get(walkId));
    await expect(t.mutation(api.demo.forceDemoSubmissionVerdict, { submissionId: walk!.feedSubmissionId, verdict: "passed" })).rejects.toThrow("map referee");
    expect(await t.run(ctx => ctx.db.get(walk!.feedSubmissionId))).toMatchObject({ verdict: "pending" });
  });

  it("keeps the sidequest demo cutoff open near the regular cutoff", async () => {
    vi.setSystemTime(Date.UTC(2026, 0, 5, 6, 59, 59));
    const t = convexTest(schema, modules);
    const { potId, userId } = await t.mutation(api.demo.seedSidequestDemoPot, {});
    const sidequestId = await t.mutation(api.demo.demoTrigger5MinWarning, { potId, userId, lat: 37.772, lng: -122.389 });
    const [pot, quest] = await t.run(async ctx => Promise.all([ctx.db.get(potId), ctx.db.get(sidequestId)]));
    expect(pot!.nextDeadlineAt).toBeGreaterThan(quest!.expiresAt);
    const walkId = await t.mutation(api.demo.demoSimulateWalkTrace, { sidequestId, mode: "valid_walk" });
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
    expect((await t.run(ctx => ctx.db.get(walkId)))?.verdict).toBe("passed");
  });

  it("resets the sidequest demo without changing the existing stage pot", async () => {
    const t = convexTest(schema, modules);
    const stage = await t.mutation(api.demo.seedStageDemoPot, {});
    const { potId, userId } = await t.mutation(api.demo.seedSidequestDemoPot, {});
    const sidequestId = await t.mutation(api.demo.demoTrigger5MinWarning, { potId, userId, lat: 37.772, lng: -122.389 });
    await t.mutation(api.demo.demoSimulateWalkTrace, { sidequestId, mode: "valid_walk" });
    await t.mutation(api.demo.seedSidequestDemoPot, {});
    const [stagePot, oldQuest, walks, member] = await t.run(async ctx => Promise.all([
      ctx.db.get(stage.potId), ctx.db.get(sidequestId), ctx.db.query("walkSubmissions").collect(),
      ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", potId).eq("userId", userId)).unique(),
    ]));
    expect(stagePot).toMatchObject({ currentDayIndex: 4, potTotalCents: 4000 });
    expect(oldQuest).toBeNull();
    expect(walks).toEqual([]);
    expect(member?.completedDays).toEqual([]);
    const nextQuestId = await t.mutation(api.demo.demoTrigger5MinWarning, { potId, userId, lat: 37.772, lng: -122.389 });
    expect(nextQuestId).not.toBe(sidequestId);
  });
});
