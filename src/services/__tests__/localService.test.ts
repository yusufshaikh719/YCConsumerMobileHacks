import { describe, expect, it } from "vitest";
import { distanceMeters } from "../../lib/geo";
import { isInWindows, PING_LEAD_MS } from "../../lib/time";
import { completionMinutes, createLocalService, weekBounds } from "../localService";
import { memoryStorage } from "../memoryStorage";
import { NoLandmarkError, type Landmark, type LatLng } from "../types";

const NOW = new Date(2026, 10, 15, 9, 0).getTime();
const origin: LatLng = { lat: -33.86, lng: 151.21 };
const landmarkNear = (from: LatLng): Landmark => ({ id: "wiki-3", name: "Harbour Steps", neighborhood: "Quay", coords: { lat: from.lat + 0.007, lng: from.lng }, thumbnail: null, trivia: "", source: "Wikipedia", radiusMeters: 50 });

function make(initial: string | null = null, discover = async (from: LatLng) => landmarkNear(from) as Landmark | null) {
  let now = NOW;
  const storage = memoryStorage(initial);
  const service = createLocalService({ storage, discover, clock: () => now });
  return { service, storage, setNow: (t: number) => (now = t) };
}

describe("local service", () => {
  it("starts with only you, no postcards, and onboarding still to do", async () => {
    const { service } = make();
    await service.load();
    const data = service.getSnapshot();
    expect(data.loaded).toBe(true);
    expect(data.onboarded).toBe(false);
    expect(data.group.members.map(m => m.name)).toEqual(["You"]);
    expect(data.group.name).toBe("Your group");
    expect(data.group.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(data.potCents).toBe(data.stakeCents);
    expect(data.postcards).toEqual([]);
    expect(data.standings).toHaveLength(1);
  });

  it("is not loaded until storage has been read", () => {
    expect(make().service.getSnapshot().loaded).toBe(false);
  });

  it("onboards: name, created group, windows, then marks it done and persists everything", async () => {
    const { service, storage } = make();
    await service.load();
    await service.setName("  Aahil Shaikh ");
    await service.createGroup("");
    await service.setWindows([{ startMinute: 17 * 60, endMinute: 19 * 60 }, { startMinute: 12 * 60, endMinute: 13 * 60 }]);
    await service.finishOnboarding();
    const data = service.getSnapshot();
    expect(data.onboarded).toBe(true);
    expect(data.group).toMatchObject({ name: "Aahil's group", joined: false });
    expect(data.windows.map(w => w.startMinute)).toEqual([12 * 60, 17 * 60]);
    expect(data.group.members[0].fullName).toBe("Aahil Shaikh");

    const reopened = make(storage.text).service;
    await reopened.load();
    expect(reopened.getSnapshot()).toMatchObject({ onboarded: true, windows: data.windows, group: { name: "Aahil's group", inviteCode: data.group.inviteCode } });
  });

  it("joins a group by code or link and rejects junk", async () => {
    const { service } = make();
    expect(await service.joinGroup("nope!")).toBe(false);
    expect(await service.joinGroup("ante://join/ab12cd")).toBe(true);
    expect(service.getSnapshot().group).toMatchObject({ name: "Group AB12CD", inviteCode: "AB12CD", joined: true });
    await service.createGroup("Hill Walkers");
    const group = service.getSnapshot().group;
    expect(group).toMatchObject({ name: "Hill Walkers", joined: false });
    expect(group.inviteCode).not.toBe("AB12CD");
  });

  it("refuses overlapping windows and re-arms the ping across every slot", async () => {
    const { service } = make();
    await expect(service.setWindows([{ startMinute: 12 * 60, endMinute: 14 * 60 }, { startMinute: 13 * 60, endMinute: 15 * 60 }])).rejects.toThrow();
    const windows = [{ startMinute: 10 * 60, endMinute: 11 * 60 }, { startMinute: 15 * 60, endMinute: 18 * 60 }];
    await service.armNextPing(NOW);
    await service.setWindows(windows);
    expect(service.getSnapshot().nextPingAt).toBeNull();
    for (let i = 0; i < 25; i++) {
      const ping = (await service.armNextPing(NOW))!;
      expect(isInWindows(windows, ping)).toBe(true);
      expect(isInWindows(windows, ping + PING_LEAD_MS)).toBe(true);
    }
  });

  it("ignores a corrupt or overlapping saved file instead of crashing", async () => {
    const bad = make("{not json");
    await bad.service.load();
    expect(bad.service.getSnapshot()).toMatchObject({ loaded: true, onboarded: false });
    const overlapping = make(JSON.stringify({ onboarded: true, windows: [{ startMinute: 600, endMinute: 700 }, { startMinute: 650, endMinute: 800 }] }));
    await overlapping.service.load();
    expect(overlapping.service.getSnapshot().windows).toEqual([{ startMinute: 900, endMinute: 1080 }]);
  });

  it("builds the quest around the position it is given", async () => {
    const seen: LatLng[] = [];
    const { service } = make(null, async from => {
      seen.push(from);
      return landmarkNear(from);
    });
    const quest = await service.startSidequest(NOW, origin);
    expect(seen).toEqual([origin]);
    expect(quest.origin).toEqual(origin);
    expect(quest.distanceMeters).toBeCloseTo(distanceMeters(origin, quest.landmark.coords));
    expect(quest.revealAt).toBe(NOW + PING_LEAD_MS);
    expect(quest.expiresAt - quest.revealAt).toBe(completionMinutes(quest.walkMinutes) * 60_000);
  });

  it("throws NoLandmarkError when discovery finds nothing", async () => {
    const { service } = make(null, async () => null);
    await expect(service.startSidequest(NOW, origin)).rejects.toBeInstanceOf(NoLandmarkError);
  });

  it("stamps a postcard inside the fence and persists it, but not from outside", async () => {
    const { service, storage, setNow } = make();
    const quest = await service.startSidequest(NOW, origin);
    setNow(quest.revealAt + 12 * 60_000);
    expect(await service.verifyArrival(quest, "file:///x.jpg", { ...origin, accuracy: 10 })).toEqual({ ok: false, reason: "not_verified" });
    const result = await service.verifyArrival(quest, "file:///x.jpg", { ...quest.landmark.coords, accuracy: 15 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.postcard).toMatchObject({ memberId: "me", photo: { uri: "file:///x.jpg" }, minutesTaken: 12 });
    expect(result.before[0].completed).toBe(0);
    expect(result.after[0].completed).toBe(1);

    const reopened = make(storage.text);
    reopened.setNow(quest.revealAt + 12 * 60_000);
    await reopened.service.load();
    expect(reopened.service.getSnapshot().postcards.map(p => p.landmark.name)).toEqual(["Harbour Steps"]);
  });

  it("only shows this week's postcards", async () => {
    const { service, storage, setNow } = make();
    const quest = await service.startSidequest(NOW, origin);
    await service.verifyArrival(quest, null, quest.landmark.coords);
    const nextWeek = make(storage.text);
    nextWeek.setNow(weekBounds(NOW).endsAt + 60_000);
    await nextWeek.service.load();
    expect(nextWeek.service.getSnapshot().postcards).toEqual([]);
  });

  it("toggles your reaction on a postcard", async () => {
    const { service } = make();
    const quest = await service.startSidequest(NOW, origin);
    await service.verifyArrival(quest, null, quest.landmark.coords);
    const id = service.getSnapshot().postcards[0].id;
    await service.react(id, "🔥");
    expect(service.getSnapshot().postcards[0].reactions["🔥"]).toEqual(["me"]);
    await service.react(id, "🔥");
    expect(service.getSnapshot().postcards[0].reactions["🔥"]).toEqual([]);
  });
});
