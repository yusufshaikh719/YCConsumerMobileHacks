import { describe, expect, it } from "vitest";
import { addWindow, boundsFor, DAY_START, fits, LAST_END, MAX_WINDOWS, overlaps, parseInviteCode, sameWindows, validWindows } from "../windows";

const w = (from: number, to: number) => ({ startMinute: from * 60, endMinute: to * 60 });

describe("editing sidequest windows", () => {
  it("detects overlaps regardless of order, but allows touching slots", () => {
    expect(overlaps([w(15, 18), w(12, 16)])).toBe(true);
    expect(overlaps([w(15, 18), w(12, 15)])).toBe(false);
    expect(overlaps([w(15, 18)])).toBe(false);
  });

  it("validates count, overlap, minimum span, and day bounds", () => {
    expect(validWindows([w(15, 18)])).toBe(true);
    expect(validWindows([])).toBe(false);
    expect(validWindows([w(15, 18), w(17, 19)])).toBe(false);
    expect(validWindows([{ startMinute: 900, endMinute: 930 }])).toBe(false);
    expect(validWindows([w(5, 7)])).toBe(false);
    expect(validWindows([w(7, 8), w(9, 10), w(11, 12), w(13, 14), w(15, 16)])).toBe(false);
  });

  it("bounds each slot's steppers by its neighbours so slots can't overlap", () => {
    const sorted = [w(12, 13), w(15, 18), w(20, 21)];
    expect(boundsFor(sorted, 1)).toEqual({ startMin: 13 * 60, startMax: 17 * 60, endMin: 16 * 60, endMax: 20 * 60 });
    expect(boundsFor(sorted, 0)).toMatchObject({ startMin: DAY_START, endMax: 15 * 60 });
    expect(boundsFor(sorted, 2)).toMatchObject({ startMin: 18 * 60, endMax: LAST_END });
  });

  it("only lets a preset replace a slot when it fits", () => {
    expect(fits([w(15, 18), w(19, 21)], 1, { startMinute: 17 * 60 + 30, endMinute: 20 * 60 })).toBe(false);
    expect(fits([w(15, 18), w(19, 21)], 0, w(12, 14))).toBe(true);
  });

  it("adds a new slot after the latest one, with a buffer", () => {
    expect(addWindow([w(15, 18)])).toEqual([w(15, 18), w(19, 21)]);
    expect(addWindow([w(15, 18), w(19, 21)])).toEqual([w(15, 18), w(19, 21), { startMinute: 22 * 60, endMinute: LAST_END }]);
  });

  it("falls back to the morning when the evening is full, and stops at the cap", () => {
    expect(addWindow([w(15, 23.5)])).toEqual([w(6, 8), w(15, 23.5)]);
    const full = Array.from({ length: MAX_WINDOWS }, (_, i) => w(7 + i * 2, 8 + i * 2));
    expect(addWindow(full)).toBeNull();
    expect(addWindow([w(6, 23.5)])).toBeNull();
  });

  it("compares slot lists ignoring order", () => {
    expect(sameWindows([w(15, 18), w(12, 13)], [w(12, 13), w(15, 18)])).toBe(true);
    expect(sameWindows([w(15, 18)], [w(15, 19)])).toBe(false);
  });
});

describe("invite codes", () => {
  it("accepts a bare code or a whole link", () => {
    expect(parseInviteCode("hill42")).toBe("HILL42");
    expect(parseInviteCode("  ante://join/AB12CD ")).toBe("AB12CD");
    expect(parseInviteCode("Join my group on Ante ante://join/XYZ999")).toBe("XYZ999");
  });

  it("rejects things that aren't codes", () => {
    expect(parseInviteCode("")).toBeNull();
    expect(parseInviteCode("ab")).toBeNull();
    expect(parseInviteCode("not-a-code!")).toBeNull();
  });
});
