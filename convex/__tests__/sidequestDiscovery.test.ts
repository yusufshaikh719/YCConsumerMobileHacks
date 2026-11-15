import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { haversineMeters, walkingMinutes } from "../sidequests";

const modules = import.meta.glob("../**/*.ts");
const now = Date.UTC(2026, 0, 5, 6);
const origin = { lat: 37.77, lng: -122.39 };
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });

async function setup() {
  const t = convexTest(schema, modules);
  const { potId, userId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { name: "Walker", handle: "walker", simulatedWalletBalanceCents: 0, createdAt: now });
    const potId = await ctx.db.insert("pots", { title: "Walk", habitCategory: "fitness", habitPrompt: "Walk", stakeCents: 1000, status: "active", roastPersona: "drill_sergeant", currentDayIndex: 1, dailyCutoffHourUtc: 12, nextDeadlineAt: now + 86_400_000, potTotalCents: 1000, forfeitedCents: 0, createdByUserId: userId, createdAt: now });
    await ctx.db.insert("memberships", { potId, userId, stakeStatus: "funded", streakCount: 0, completedDays: [], missedDays: [], joinedAt: now });
    return { potId, userId };
  });
  return { t, potId, userId };
}

describe("sidequest discovery and lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("parses Wikipedia extracts and OSM centers and filters walking distance", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("list=geosearch")) {
        expect((init?.headers as Record<string, string>)["User-Agent"]).toBe("AnteApp/1.0 (https://github.com/yusufshaikh719/YCConsumerMobileHacks)");
        expect(new URL(url).searchParams.get("gslimit")).toBe("50");
        return json({ query: { geosearch: [{ title: "Too close", lat: origin.lat + 0.001, lon: origin.lng, pageid: 1 }, { title: "Interesting Park", lat: origin.lat + 0.007, lon: origin.lng, pageid: 2 }] } });
      }
      if (url.includes("prop=extracts")) return json({ query: { pages: { 2: { extract: "A historic park." } } } });
      if (url.includes("overpass-api")) {
        expect(init?.headers).toMatchObject({ "Accept": "application/json", "User-Agent": "AnteApp/1.0 (https://github.com/yusufshaikh719/YCConsumerMobileHacks)" });
        return json({ elements: [{ type: "way", id: 7, tags: { name: "Garden" }, center: { lat: origin.lat - 0.008, lon: origin.lng } }] });
      }
      throw new Error("unexpected URL");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await setup();
    const result = await t.action(anyApi.sidequests.discoverNearbySidequest, origin);
    expect(result).toMatchObject({ destName: "Interesting Park", destSummary: "A historic park.", destSource: "wikipedia", mode: "fallback", targetRadiusMeters: 65 });
    expect(result.distanceMeters).toBeGreaterThanOrEqual(450);
    expect(result.distanceMeters).toBeLessThanOrEqual(1450);
    expect(result.allottedMinutes).toBe(walkingMinutes(result.distanceMeters));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("finds a walkable landmark beyond dense nearby results", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("list=geosearch")) {
        const limit = Number(new URL(url).searchParams.get("gslimit"));
        const hits = Array.from({ length: 12 }, (_, i) => ({ pageid: i + 1, title: `Nearby ${i}`, lat: origin.lat + 0.001, lon: origin.lng }));
        hits.push({ pageid: 13, title: "Walkable landmark", lat: origin.lat + 0.008, lon: origin.lng });
        return json({ query: { geosearch: hits.slice(0, limit) } });
      }
      if (url.includes("prop=extracts")) return json({ query: { pages: {} } });
      throw new Error("Overpass unavailable");
    }));
    const { t } = await setup();
    expect(await t.action(anyApi.sidequests.discoverNearbySidequest, origin)).toMatchObject({ destName: "Walkable landmark", destSource: "wikipedia" });
  });

  it("uses a named OSM destination when Wikipedia fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("overpass-api")) return json({ elements: [{ type: "way", id: 7, tags: { name: "Garden", description: "Flowers and trees" }, center: { lat: origin.lat + 0.008, lon: origin.lng } }, { type: "node", id: 8, tags: { name: "Far away" }, lat: origin.lat + 0.03, lon: origin.lng }] });
      throw new Error("offline");
    }));
    const { t } = await setup();
    const result = await t.action(anyApi.sidequests.discoverNearbySidequest, origin);
    expect(result).toMatchObject({ destName: "Garden", destSource: "openstreetmap", destSummary: "Flowers and trees", destUrl: "https://www.openstreetmap.org/way/7" });
  });

  it("uses bounded, deterministic offline fallback and validates coordinates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { t } = await setup();
    const a = await t.action(anyApi.sidequests.discoverNearbySidequest, { lat: 40, lng: -75 });
    const b = await t.action(anyApi.sidequests.discoverNearbySidequest, { lat: 40, lng: -75 });
    expect(a).toEqual(b);
    expect(a).toMatchObject({ destSource: "curated_fallback", mode: "fallback" });
    expect(haversineMeters(40, -75, a.destLat, a.destLng)).toBeCloseTo(850, 0);
    await expect(t.action(anyApi.sidequests.discoverNearbySidequest, { lat: 91, lng: 0 })).rejects.toThrow("Invalid coordinates");
  });

  it("accepts AI selection only when it names an actual candidate", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("overpass-api")) return json({ elements: [{ type: "node", id: 1, lat: origin.lat + 0.008, lon: origin.lng, tags: { name: "Garden" } }] });
      if (url.includes("openai.com")) return json({ choices: [{ message: { content: JSON.stringify({ index: 0, instruction: "Walk to Garden and find the flowers." }) } }] });
      throw new Error("offline");
    }));
    const { t } = await setup();
    expect(await t.action(anyApi.sidequests.discoverNearbySidequest, origin)).toMatchObject({ destName: "Garden", instruction: "Walk to Garden and find the flowers.", mode: "live" });
  });

  it("falls back after hung discovery requests even if fetch ignores abort", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { t } = await setup();
    const result = t.action(anyApi.sidequests.discoverNearbySidequest, origin);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({ destSource: "curated_fallback", mode: "fallback" });
  });

  it("schedules warning, activation and timeout and deduplicates retries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { t, potId, userId } = await setup();
    const id = await t.action(anyApi.sidequests.triggerSidequestWarning, { potId, userId, ...origin });
    const second = await t.action(anyApi.sidequests.triggerSidequestWarning, { potId, userId, ...origin });
    expect(second).toEqual(id);
    const warning = await t.query(anyApi.sidequests.getSidequest, { sidequestId: id });
    expect(warning).toMatchObject({ status: "warning_5m", warningSentAt: now, startsAt: now + 300_000, expiresAt: now + 300_000 + warning.allottedMinutes * 60_000 });
    const scheduled = await t.run(async ctx => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(3);
    expect(scheduled.map(job => job.name)).toEqual(expect.arrayContaining(["sidequests:activateSidequest", "sidequests:timeoutSidequest", "whop:postChatAnnouncement"]));
    expect(await t.mutation(anyApi.sidequests.activateSidequest, { sidequestId: id })).toBe(false);
    vi.setSystemTime(warning.startsAt);
    expect(await t.mutation(anyApi.sidequests.activateSidequest, { sidequestId: id })).toBe(true);
    expect((await t.query(anyApi.sidequests.getSidequest, { sidequestId: id })).status).toBe("active");
    vi.setSystemTime(warning.expiresAt);
    expect(await t.mutation(anyApi.sidequests.timeoutSidequest, { sidequestId: id })).toBe(true);
    expect((await t.query(anyApi.sidequests.getSidequest, { sidequestId: id })).status).toBe("failed_timeout");
  });

  it("starts immediately with a full duration and ignores stale scheduled jobs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { t, potId, userId } = await setup();
    const id = await t.action(anyApi.sidequests.triggerSidequestWarning, { potId, userId, ...origin });
    vi.setSystemTime(now + 360_000);
    expect(await t.mutation(anyApi.sidequests.startSidequestNow, { sidequestId: id })).toBe(true);
    const quest = await t.query(anyApi.sidequests.getSidequest, { sidequestId: id });
    expect(quest).toMatchObject({ status: "active", startsAt: now + 360_000, expiresAt: now + 360_000 + quest.allottedMinutes * 60_000 });
    expect(await t.mutation(anyApi.sidequests.startSidequestNow, { sidequestId: id })).toBe(false);
    vi.setSystemTime(now + 300_000 + quest.allottedMinutes * 60_000);
    expect(await t.mutation(anyApi.sidequests.timeoutSidequest, { sidequestId: id })).toBe(false);
    vi.setSystemTime(quest.expiresAt);
    expect(await t.mutation(anyApi.sidequests.timeoutSidequest, { sidequestId: id })).toBe(true);
  });

  it("refuses warning when the player already finished or the cutoff is too close", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { t, potId, userId } = await setup();
    await t.run(async ctx => ctx.db.patch(potId, { nextDeadlineAt: now + 6 * 60_000 }));
    await expect(t.action(anyApi.sidequests.triggerSidequestWarning, { potId, userId, ...origin })).rejects.toThrow("Not enough time");
    await t.run(async ctx => {
      await ctx.db.patch(potId, { nextDeadlineAt: now + 86_400_000 });
      const member = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", potId).eq("userId", userId)).unique();
      await ctx.db.patch(member!._id, { completedDays: [1] });
    });
    await expect(t.action(anyApi.sidequests.triggerSidequestWarning, { potId, userId, ...origin })).rejects.toThrow("already completed");
  });

  it("respects a cutoff shortened after warning", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { t, potId, userId } = await setup();
    const id = await t.action(anyApi.sidequests.triggerSidequestWarning, { potId, userId, ...origin });
    const cutoff = now + 10 * 60_000;
    await t.run(async ctx => ctx.db.patch(potId, { nextDeadlineAt: cutoff }));
    await expect(t.mutation(anyApi.sidequests.startSidequestNow, { sidequestId: id })).rejects.toThrow("Not enough time");
    vi.setSystemTime(now + 5 * 60_000);
    expect(await t.mutation(anyApi.sidequests.activateSidequest, { sidequestId: id })).toBe(true);
    expect(await t.query(anyApi.sidequests.getSidequest, { sidequestId: id })).toMatchObject({ status: "active", expiresAt: cutoff });
    vi.setSystemTime(cutoff);
    expect(await t.mutation(anyApi.sidequests.timeoutSidequest, { sidequestId: id })).toBe(true);
  });
});
