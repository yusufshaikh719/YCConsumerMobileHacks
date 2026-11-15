import { describe, expect, it, vi } from "vitest";
import { isInWindow, PING_LEAD_MS } from "../../lib/time";
import { createFixtureService } from "../fixtureService";
import { ME_ID } from "../fixtures";

const NOW = new Date(2026, 10, 15, 14, 0).getTime();

describe("fixture service", () => {
  it("seeds a realistic week: six friends, a $120 pot, Sarah ahead of you on time", () => {
    const data = createFixtureService(NOW, 0).getSnapshot();
    expect(data.group.members).toHaveLength(6);
    expect(data.potCents).toBe(12_000);
    expect(data.standings.slice(0, 2).map(s => [s.member.id, s.completed])).toEqual([["sarah", 3], [ME_ID, 3]]);
    expect(data.postcards.every(p => p.completedAt <= NOW)).toBe(true);
  });

  it("arms a ping inside the free window and never earlier than a minute out", async () => {
    const service = createFixtureService(NOW, 0);
    const pingAt = await service.armNextPing(NOW);
    expect(service.getSnapshot().nextPingAt).toBe(pingAt);
    expect(isInWindow(service.getSnapshot().window, pingAt)).toBe(true);
    expect(pingAt).toBeGreaterThanOrEqual(NOW + PING_LEAD_MS);
  });

  it("builds a sidequest whose reveal is a minute after the scheduled ping, and clears the armed ping", async () => {
    const service = createFixtureService(NOW, 0);
    const pingAt = await service.armNextPing(NOW);
    const quest = await service.startSidequest(pingAt);
    expect(quest.revealAt - quest.pingAt).toBe(PING_LEAD_MS);
    expect(quest.expiresAt - quest.revealAt).toBe(20 * 60_000);
    expect(quest.distanceMeters).toBeGreaterThan(600);
    expect(service.getSnapshot().nextPingAt).toBeNull();
  });

  it("changing the window notifies subscribers and disarms the old ping", async () => {
    const service = createFixtureService(NOW, 0);
    await service.armNextPing(NOW);
    const listener = vi.fn();
    service.subscribe(listener);
    await service.setWindow({ startMinute: 12 * 60, endMinute: 14 * 60 });
    expect(listener).toHaveBeenCalled();
    expect(service.getSnapshot().window.startMinute).toBe(720);
    expect(service.getSnapshot().nextPingAt).toBeNull();
  });

  it("verifies inside the fence, adds your postcard, and moves you past Sarah", async () => {
    const service = createFixtureService(NOW, 0);
    const quest = await service.startSidequest(NOW - PING_LEAD_MS - 11 * 60_000);
    const result = await service.verifyArrival(quest, "file:///selfie.jpg", quest.landmark.coords);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.postcard.photo).toEqual({ uri: "file:///selfie.jpg" });
    expect(result.before.find(s => s.member.id === ME_ID)?.rank).toBe(2);
    expect(result.after.find(s => s.member.id === ME_ID)).toMatchObject({ rank: 1, completed: 4 });
    expect(service.getSnapshot().postcards[0].id).toBe(result.postcard.id);
  });

  it("rejects a selfie taken outside the fence or when forced to fail", async () => {
    const service = createFixtureService(NOW, 0);
    const quest = await service.startSidequest(NOW - PING_LEAD_MS);
    expect(await service.verifyArrival(quest, null, quest.origin)).toEqual({ ok: false, reason: "not_verified" });
    service.failNextVerification();
    expect((await service.verifyArrival(quest, null, quest.landmark.coords)).ok).toBe(false);
    expect((await service.verifyArrival(quest, null, quest.landmark.coords)).ok).toBe(true);
  });

  it("verifying the same sidequest twice keeps one postcard", async () => {
    const service = createFixtureService(NOW, 0);
    const quest = await service.startSidequest(NOW - PING_LEAD_MS);
    await service.verifyArrival(quest, null, quest.landmark.coords);
    await service.verifyArrival(quest, null, quest.landmark.coords);
    expect(service.getSnapshot().postcards.filter(p => p.memberId === ME_ID)).toHaveLength(4);
  });

  it("toggles your reaction on a postcard", async () => {
    const service = createFixtureService(NOW, 0);
    const card = service.getSnapshot().postcards[0];
    await service.react(card.id, "🔥");
    expect(service.getSnapshot().postcards[0].reactions["🔥"]).toContain(ME_ID);
    await service.react(card.id, "🔥");
    expect(service.getSnapshot().postcards[0].reactions["🔥"]).not.toContain(ME_ID);
  });
});
