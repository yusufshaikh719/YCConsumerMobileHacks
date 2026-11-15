import { describe, expect, it } from "vitest";
import { formatClock, formatMinSec, isInWindow, nextWindowStart, pickPingTime } from "../time";

const window = { startMinute: 15 * 60, endMinute: 18 * 60 };
const at = (h: number, m = 0, day = 15) => new Date(2026, 10, day, h, m).getTime();

describe("free window timing", () => {
  it("knows whether now is inside the window", () => {
    expect(isInWindow(window, at(16))).toBe(true);
    expect(isInWindow(window, at(18))).toBe(false);
    expect(isInWindow(window, at(9))).toBe(false);
  });

  it("finds the next opening", () => {
    expect(nextWindowStart(window, at(9))).toBe(at(15));
    expect(nextWindowStart(window, at(19))).toBe(at(15, 0, 16));
  });

  it("picks a ping inside today's remaining window, leaving a minute of warning", () => {
    for (const r of [0, 0.5, 0.999]) {
      const ping = pickPingTime(window, at(16), () => r);
      expect(ping).toBeGreaterThanOrEqual(at(16, 1));
      expect(ping).toBeLessThanOrEqual(at(17, 59));
    }
  });

  it("rolls to tomorrow once today's window has passed", () => {
    const ping = pickPingTime(window, at(20), () => 0);
    expect(ping).toBe(at(15, 0, 16));
  });

  it("formats clocks and countdowns", () => {
    expect(formatClock(15 * 60)).toBe("3:00 PM");
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(12 * 60 + 30)).toBe("12:30 PM");
    expect(formatMinSec(65_000)).toBe("1:05");
  });
});
