import { describe, expect, it } from "vitest";
import { insideGeofence } from "../../lib/geofence";
import { SIMULATED_WALK_MS, simulatedPosition } from "../../lib/simulatedWalk";
import { PING_LEAD_MS } from "../../lib/time";
import { createFixtureService } from "../../services/fixtureService";
import { passedMembers } from "../../services/standings";
import { initialPhase, pingSecondsLeft, reduce, type Phase } from "../machine";

const NOW = new Date(2026, 10, 15, 15, 30).getTime();

describe("a full sidequest against the fixture service", () => {
  it("goes waiting → ping → live → arrived → verifying → verified → waiting", async () => {
    const service = createFixtureService(NOW, 0);
    const pingAt = await service.armNextPing(NOW);
    const quest = await service.startSidequest(pingAt);

    const deliveredLate = pingAt + 7_000;
    let phase: Phase = reduce(initialPhase, { type: "PING", quest, now: deliveredLate });
    expect(phase.name).toBe("ping");
    expect(pingSecondsLeft(quest, deliveredLate)).toBe(53);

    phase = reduce(phase, { type: "REVEAL" });
    expect(phase.name).toBe("live");

    let t = quest.revealAt;
    while (!insideGeofence(simulatedPosition(quest, t), quest.landmark)) t += 1_000;
    expect(t).toBeLessThanOrEqual(quest.revealAt + SIMULATED_WALK_MS);
    expect(t).toBeLessThan(quest.expiresAt);
    phase = reduce(phase, { type: "ARRIVE" });
    expect(phase.name).toBe("arrived");

    phase = reduce(phase, { type: "CAPTURE", photoUri: "file:///selfie.jpg" });
    expect(phase.name).toBe("verifying");
    const result = await service.verifyArrival(quest, "file:///selfie.jpg", simulatedPosition(quest, t));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    phase = reduce(phase, { type: "VERIFIED", result });
    expect(phase.name).toBe("verified");
    expect(passedMembers(result.before, result.after, service.getSnapshot().meId).map(m => m.name)).toEqual(["Sarah"]);

    expect(reduce(phase, { type: "DONE" })).toEqual(initialPhase);
  });

  it("opening the app long after the ping lands on time's up, not a stale countdown", async () => {
    const service = createFixtureService(NOW, 0);
    const quest = await service.startSidequest(NOW);
    expect(reduce(initialPhase, { type: "PING", quest, now: quest.expiresAt + 60_000 })).toMatchObject({ name: "failed", reason: "timeout" });
    expect(reduce(initialPhase, { type: "PING", quest, now: NOW + PING_LEAD_MS + 1 }).name).toBe("live");
  });
});
