import { describe, expect, it } from "vitest";
import { activeWindow, formatClock, formatMinSec, isInWindows, nextWindowStart, pickPingTime } from "../time";

const afternoon = { startMinute: 15 * 60, endMinute: 18 * 60 };
const lunch = { startMinute: 12 * 60, endMinute: 13 * 60 };
const evening = { startMinute: 20 * 60, endMinute: 21 * 60 };
const at = (h: number, m = 0, day = 15) => new Date(2026, 10, day, h, m).getTime();

describe("sidequest windows", () => {
  it("is armed when any slot is active", () => {
    const slots = [lunch, afternoon];
    expect(isInWindows(slots, at(12, 30))).toBe(true);
    expect(activeWindow(slots, at(16))).toEqual(afternoon);
    expect(isInWindows(slots, at(14))).toBe(false);
    expect(isInWindows(slots, at(18))).toBe(false);
    expect(isInWindows([], at(16))).toBe(false);
  });

  it("finds the next slot to open, today or tomorrow", () => {
    const slots = [afternoon, lunch, evening];
    expect(nextWindowStart(slots, at(9))).toBe(at(12));
    expect(nextWindowStart(slots, at(12, 30))).toBe(at(15));
    expect(nextWindowStart(slots, at(19))).toBe(at(20));
    expect(nextWindowStart(slots, at(22))).toBe(at(12, 0, 16));
    expect(nextWindowStart(slots, at(15))).toBe(at(20));
    expect(nextWindowStart([], at(9))).toBeNull();
  });

  it("picks a ping inside today's remaining single window, leaving a minute of warning", () => {
    for (const r of [0, 0.5, 0.999]) {
      const ping = pickPingTime([afternoon], at(16), () => r)!;
      expect(ping).toBeGreaterThanOrEqual(at(16, 1));
      expect(ping).toBeLessThanOrEqual(at(17, 59));
    }
  });

  it("spreads the ping across the union of today's slots by their length", () => {
    const slots = [lunch, afternoon];
    expect(pickPingTime(slots, at(9), () => 0)).toBe(at(12));
    const lunchShare = 59 / (59 + 179);
    expect(pickPingTime(slots, at(9), () => lunchShare - 0.001)!).toBeLessThan(at(12, 59));
    expect(pickPingTime(slots, at(9), () => lunchShare + 0.001)!).toBeGreaterThanOrEqual(at(15));
    expect(pickPingTime(slots, at(9), () => 0.999999)!).toBeLessThanOrEqual(at(17, 59));
    for (let r = 0; r < 1; r += 0.01) {
      const ping = pickPingTime(slots, at(9), () => r)!;
      expect(isInWindows(slots, ping) && isInWindows(slots, ping + 60_000)).toBe(true);
    }
  });

  it("skips slots that have already passed today", () => {
    const ping = pickPingTime([lunch, afternoon], at(14), () => 0);
    expect(ping).toBe(at(15));
  });

  it("rolls to tomorrow's first slot once today's are done", () => {
    expect(pickPingTime([afternoon, lunch], at(20), () => 0)).toBe(at(12, 0, 16));
    expect(pickPingTime([afternoon], at(17, 59), () => 0)).toBe(at(15, 0, 16));
    expect(pickPingTime([], at(9))).toBeNull();
  });

  it("formats clocks and countdowns", () => {
    expect(formatClock(15 * 60)).toBe("3:00 PM");
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(12 * 60 + 30)).toBe("12:30 PM");
    expect(formatMinSec(65_000)).toBe("1:05");
  });
});
