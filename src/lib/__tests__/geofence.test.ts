import { describe, expect, it } from "vitest";
import { landmarks, todaysQuest } from "../../services/fixtures";
import { insideGeofence } from "../geofence";
import { stepToward, distanceMeters } from "../geo";

const coit = landmarks.coit;

describe("geofence", () => {
  it("is inside at the landmark and just within the radius", () => {
    expect(insideGeofence(coit.coords, coit)).toBe(true);
    const edge = stepToward(coit.coords, todaysQuest.origin, coit.radiusMeters - 1);
    expect(insideGeofence(edge, coit)).toBe(true);
  });

  it("is outside just past the radius, unless slack is allowed for the referee", () => {
    const past = stepToward(coit.coords, todaysQuest.origin, coit.radiusMeters + 5);
    expect(insideGeofence(past, coit)).toBe(false);
    expect(insideGeofence(past, coit, 1.5)).toBe(true);
  });

  it("starts the walk well outside the fence", () => {
    expect(insideGeofence(todaysQuest.origin, coit)).toBe(false);
    expect(distanceMeters(todaysQuest.origin, coit.coords)).toBeGreaterThan(600);
  });
});
