import { describe, expect, it } from "vitest";
import { stepToward } from "../../lib/geo";
import { arrivedAt } from "../../lib/geofence";
import { PING_LEAD_MS } from "../../lib/time";
import { createLocalService } from "../../services/localService";
import { memoryStorage } from "../../services/memoryStorage";
import type { Landmark, LatLng } from "../../services/types";
import { initialPhase, pingSecondsLeft, reduce, type Phase } from "../machine";

const NOW = new Date(2026, 10, 15, 15, 30).getTime();
const home: LatLng = { lat: 51.5, lng: -0.12 };
const nearby = (origin: LatLng): Landmark => ({ id: "wiki-7", name: "Old Mill", neighborhood: "Riverside", coords: { lat: origin.lat + 0.0072, lng: origin.lng }, thumbnail: null, trivia: "Ground flour until 1902.", source: "Wikipedia", radiusMeters: 50 });

function setup() {
  let clock = NOW;
  const service = createLocalService({ storage: memoryStorage(JSON.stringify({ onboarded: true, name: "Aahil" })), discover: async origin => nearby(origin), clock: () => clock });
  return { service, tick: (ms: number) => (clock += ms), at: () => clock };
}

describe("a full sidequest against the local service", () => {
  it("goes waiting → ping → live → arrived → verifying → verified → waiting, from the real position", async () => {
    const { service, tick, at } = setup();
    await service.load();
    const pingAt = (await service.armNextPing(NOW))!;
    expect(pingAt).toBeGreaterThan(NOW);
    tick(pingAt + 7_000 - NOW);

    let phase: Phase = reduce(initialPhase, { type: "PING", timing: { pingAt, revealAt: pingAt + PING_LEAD_MS }, now: at() });
    expect(phase.name).toBe("ping");
    const quest = await service.startSidequest(pingAt, home);
    expect(quest.origin).toEqual(home);
    expect(quest.distanceMeters).toBeGreaterThan(700);
    expect(quest.walkMinutes).toBeGreaterThanOrEqual(10);
    expect(quest.walkMinutes).toBeLessThanOrEqual(15);
    phase = reduce(phase, { type: "QUEST_READY", quest, now: at() });
    expect(pingSecondsLeft(quest, at())).toBe(53);

    phase = reduce(phase, { type: "REVEAL" });
    expect(phase.name).toBe("live");

    let position: LatLng = home;
    while (!arrivedAt(position, quest.landmark)) {
      position = stepToward(position, quest.landmark.coords, 80);
      tick(60_000);
    }
    expect(at()).toBeLessThan(quest.expiresAt);
    phase = reduce(phase, { type: "ARRIVE" });
    expect(phase.name).toBe("arrived");

    phase = reduce(phase, { type: "CAPTURE", photoUri: "file:///selfie.jpg" });
    expect(phase.name).toBe("verifying");
    const result = await service.verifyArrival(quest, "file:///selfie.jpg", { ...position, accuracy: 12 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    phase = reduce(phase, { type: "VERIFIED", result });
    expect(phase.name).toBe("verified");
    expect(result.after.map(s => s.completed)).toEqual([1]);
    expect(service.getSnapshot().postcards[0].landmark.name).toBe("Old Mill");

    expect(reduce(phase, { type: "DONE" })).toEqual(initialPhase);
  });

  it("opening the app long after the ping lands on time's up, not a stale countdown", async () => {
    const { service } = setup();
    const quest = await service.startSidequest(NOW, home);
    const timing = { pingAt: NOW, revealAt: NOW + PING_LEAD_MS };
    const pinged = reduce(initialPhase, { type: "PING", timing, now: quest.expiresAt + 60_000 });
    expect(reduce(pinged, { type: "QUEST_READY", quest, now: quest.expiresAt + 60_000 })).toMatchObject({ name: "failed", reason: "timeout" });
    expect(reduce(pinged, { type: "QUEST_READY", quest, now: NOW + PING_LEAD_MS + 1 }).name).toBe("live");
  });
});
