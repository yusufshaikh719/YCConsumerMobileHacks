import { describe, expect, it } from "vitest";
import { bearingDegrees, distanceMeters, formatDistance, stepToward } from "../geo";

const origin = { lat: 37.7972, lng: -122.4085 };
const coit = { lat: 37.8024, lng: -122.4058 };

describe("geo helpers", () => {
  it("measures walking-scale distances", () => {
    expect(distanceMeters(origin, coit)).toBeGreaterThan(600);
    expect(distanceMeters(origin, coit)).toBeLessThan(650);
  });

  it("points north-northeast toward Coit Tower", () => {
    const bearing = bearingDegrees(origin, coit);
    expect(bearing).toBeGreaterThan(15);
    expect(bearing).toBeLessThan(35);
  });

  it("steps along the line without overshooting", () => {
    const half = stepToward(origin, coit, distanceMeters(origin, coit) / 2);
    expect(distanceMeters(half, coit)).toBeCloseTo(distanceMeters(origin, coit) / 2, 0);
    expect(stepToward(origin, coit, 10_000)).toEqual(coit);
  });

  it("formats distance for a glance", () => {
    expect(formatDistance(642)).toEqual({ value: "640", unit: "m" });
    expect(formatDistance(1234)).toEqual({ value: "1.2", unit: "km" });
  });
});
