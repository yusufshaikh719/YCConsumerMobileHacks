import { describe, expect, it } from "vitest";
import { distanceMeters } from "../../lib/geo";
import { insideGeofence } from "../../lib/geofence";
import { PING_LEAD_MS } from "../../lib/time";
import { devQuest, YC_HQ } from "../devQuest";

describe("dev switcher quest", () => {
  it("targets the 20th Street entrance of Y Combinator's HQ at 560 20th St", () => {
    expect(YC_HQ).toMatchObject({ name: "Y Combinator", coords: { lat: 37.76071, lng: -122.38602 } });
    expect(distanceMeters(YC_HQ.coords, { lat: 37.7608445, lng: -122.3860644 })).toBeLessThan(25);
  });

  it("starts a short walk away so the flow looks like a real quest", () => {
    const quest = devQuest(1_000_000);
    expect(quest.landmark).toBe(YC_HQ);
    expect(quest.distanceMeters).toBeGreaterThan(550);
    expect(quest.distanceMeters).toBeLessThan(1000);
    expect(quest.revealAt).toBe(1_000_000 + PING_LEAD_MS);
    expect(insideGeofence(quest.origin, YC_HQ)).toBe(false);
    expect(insideGeofence(YC_HQ.coords, YC_HQ)).toBe(true);
  });
});
