import { describe, expect, it } from "vitest";
import type { Landmark } from "../../services/types";
import { distanceMeters, stepToward } from "../geo";
import { arrivedAt, insideGeofence } from "../geofence";

const landmark: Landmark = { id: "l", name: "Fountain", neighborhood: "Park", coords: { lat: 40.0, lng: -73.0 }, thumbnail: null, trivia: "", source: "OpenStreetMap", radiusMeters: 50 };
const far = { lat: 40.007, lng: -73.0 };

describe("geofence", () => {
  it("is inside at the landmark and just within the radius", () => {
    expect(insideGeofence(landmark.coords, landmark)).toBe(true);
    expect(insideGeofence(stepToward(landmark.coords, far, 49), landmark)).toBe(true);
  });

  it("is outside just past the radius, unless slack is allowed for the referee", () => {
    const past = stepToward(landmark.coords, far, 55);
    expect(insideGeofence(past, landmark)).toBe(false);
    expect(insideGeofence(past, landmark, 1.5)).toBe(true);
  });

  it("counts arrival with the fix's accuracy, capped so a bad fix can't arrive from far away", () => {
    const at70 = stepToward(landmark.coords, far, 70);
    expect(arrivedAt({ ...at70, accuracy: 5 }, landmark)).toBe(false);
    expect(arrivedAt({ ...at70, accuracy: 25 }, landmark)).toBe(true);
    const at120 = stepToward(landmark.coords, far, 120);
    expect(arrivedAt({ ...at120, accuracy: 500 }, landmark)).toBe(false);
    expect(distanceMeters(far, landmark.coords)).toBeGreaterThan(700);
    expect(arrivedAt(far, landmark)).toBe(false);
  });
});
