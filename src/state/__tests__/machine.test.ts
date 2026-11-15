import { describe, expect, it } from "vitest";
import type { Sidequest } from "../../services/types";
import { initialPhase, phaseForQuest, pingSecondsLeft, questProgress, reduce } from "../machine";

const quest: Sidequest = {
  id: "sq-1",
  landmark: { id: "coit", name: "Coit Tower", neighborhood: "Telegraph Hill", coords: { lat: 37.8024, lng: -122.4058 }, thumbnail: 0, trivia: "", source: "Wikipedia", radiusMeters: 45 },
  origin: { lat: 37.7972, lng: -122.4085 },
  pingAt: 1_000_000,
  revealAt: 1_060_000,
  expiresAt: 1_060_000 + 20 * 60_000,
  distanceMeters: 620,
  walkMinutes: 9,
};
const verified = { ok: true as const, postcard: {} as never, before: [], after: [] };

describe("sidequest state machine", () => {
  it("walks the happy path from waiting to verified and back", () => {
    let phase = reduce(initialPhase, { type: "PING", quest, now: quest.pingAt });
    expect(phase.name).toBe("ping");
    phase = reduce(phase, { type: "REVEAL" });
    expect(phase.name).toBe("live");
    phase = reduce(phase, { type: "ARRIVE" });
    expect(phase.name).toBe("arrived");
    phase = reduce(phase, { type: "CAPTURE", photoUri: "file:///selfie.jpg" });
    expect(phase).toMatchObject({ name: "verifying", photoUri: "file:///selfie.jpg" });
    phase = reduce(phase, { type: "VERIFIED", result: verified });
    expect(phase.name).toBe("verified");
    expect(reduce(phase, { type: "DONE" })).toEqual(initialPhase);
  });

  it("enters the state matching a late-delivered notification", () => {
    expect(reduce(initialPhase, { type: "PING", quest, now: quest.pingAt + 45_000 }).name).toBe("ping");
    expect(reduce(initialPhase, { type: "PING", quest, now: quest.revealAt + 5_000 }).name).toBe("live");
    expect(reduce(initialPhase, { type: "PING", quest, now: quest.expiresAt })).toMatchObject({ name: "failed", reason: "timeout" });
  });

  it("times out while walking or at the camera", () => {
    expect(reduce(phaseForQuest(quest, quest.revealAt), { type: "TIMEOUT" })).toMatchObject({ name: "failed", reason: "timeout" });
    expect(reduce({ name: "arrived", quest }, { type: "TIMEOUT" })).toMatchObject({ name: "failed", reason: "timeout" });
  });

  it("lets a rejected selfie retake only while the window is open", () => {
    const failed = reduce({ name: "verifying", quest, photoUri: null }, { type: "REJECTED" });
    expect(failed).toMatchObject({ name: "failed", reason: "not_verified" });
    expect(reduce(failed, { type: "RETAKE", now: quest.expiresAt - 1 }).name).toBe("arrived");
    expect(reduce(failed, { type: "RETAKE", now: quest.expiresAt }).name).toBe("failed");
  });

  it("ignores events that do not apply to the current state", () => {
    expect(reduce(initialPhase, { type: "ARRIVE" })).toBe(initialPhase);
    const ping = { name: "ping" as const, quest };
    expect(reduce(ping, { type: "CAPTURE", photoUri: null })).toBe(ping);
  });

  it("counts the ping down from the scheduled time, not delivery", () => {
    expect(pingSecondsLeft(quest, quest.pingAt)).toBe(60);
    expect(pingSecondsLeft(quest, quest.pingAt + 12_500)).toBe(48);
    expect(pingSecondsLeft(quest, quest.revealAt + 1)).toBe(0);
    expect(questProgress(quest, quest.revealAt)).toBe(1);
    expect(questProgress(quest, quest.revealAt + 10 * 60_000)).toBeCloseTo(0.5);
  });
});
