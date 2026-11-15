import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { findNextDispatchTime, isWithinAvailabilityWindow } from "../availability";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const setAvailability = makeFunctionReference<"mutation">("availability:setAvailabilityWindows");
const getAvailability = makeFunctionReference<"query">("availability:getUserAvailability");
const monday = [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 10 * 60 }];
const at = (value: string) => Date.parse(value);

describe("weekly availability", () => {
  it("upserts a user's windows and rejects invalid slots and timezones", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(ctx => ctx.db.insert("users", { name: "Alex", handle: "alex", simulatedWalletBalanceCents: 0, createdAt: 0 }));
    const potId = await t.mutation(makeFunctionReference<"mutation">("pots:createPot"), {
      title: "Walk", habitCategory: "fitness", habitPrompt: "Walk", createdByUserId: userId,
    });
    const args = { potId, userId, timezone: "America/Los_Angeles", slots: monday };
    const id = await t.mutation(setAvailability, args);
    expect(await t.query(getAvailability, { potId, userId })).toMatchObject(args);
    expect(await t.mutation(setAvailability, { ...args, slots: [] })).toBe(id);
    expect(await t.query(getAvailability, { potId, userId })).toMatchObject({ slots: [] });
    for (const slot of [
      { dayOfWeek: 7, startMinute: 0, endMinute: 20 },
      { dayOfWeek: 1.5, startMinute: 0, endMinute: 20 },
      { dayOfWeek: 1, startMinute: -1, endMinute: 20 },
      { dayOfWeek: 1, startMinute: 0, endMinute: 19 },
      { dayOfWeek: 1, startMinute: 1420, endMinute: 1440 },
      { dayOfWeek: 1, startMinute: 100, endMinute: 99 },
      { dayOfWeek: 1, startMinute: 0.5, endMinute: 21 },
    ]) {
      await expect(t.mutation(setAvailability, { ...args, slots: [slot] })).rejects.toThrow("Invalid availability slot");
    }
    await expect(t.mutation(setAvailability, { ...args, timezone: "Not/AZone" })).rejects.toThrow("Invalid timezone");
    expect(await t.query(getAvailability, { potId, userId })).toMatchObject({ slots: [] });
  });

  it("matches local days and start-inclusive, end-exclusive times", () => {
    expect(isWithinAvailabilityWindow(monday, at("2026-01-05T16:59:59Z"), "America/Los_Angeles")).toBe(false);
    expect(isWithinAvailabilityWindow(monday, at("2026-01-05T17:00:00Z"), "America/Los_Angeles")).toBe(true);
    expect(isWithinAvailabilityWindow(monday, at("2026-01-05T17:59:59Z"), "America/Los_Angeles")).toBe(true);
    expect(isWithinAvailabilityWindow(monday, at("2026-01-05T18:00:00Z"), "America/Los_Angeles")).toBe(false);
    expect(isWithinAvailabilityWindow(monday, at("2026-01-06T17:00:00Z"), "America/Los_Angeles")).toBe(false);
    expect(() => isWithinAvailabilityWindow(monday, NaN, "UTC")).toThrow("Invalid timestamp");
  });

  it("returns the earliest warning and preserves 20 continuous minutes for the quest", () => {
    expect(findNextDispatchTime(monday, at("2026-01-05T16:00:00Z"), "America/Los_Angeles")).toEqual({ warningAt: at("2026-01-05T16:55:00Z"), startsAt: at("2026-01-05T17:00:00Z") });
    expect(findNextDispatchTime(monday, at("2026-01-05T17:10:30Z"), "America/Los_Angeles")).toEqual({ warningAt: at("2026-01-05T17:10:30Z"), startsAt: at("2026-01-05T17:15:30Z") });
    expect(findNextDispatchTime(monday, at("2026-01-05T17:35:00Z"), "America/Los_Angeles")).toEqual({ warningAt: at("2026-01-05T17:35:00Z"), startsAt: at("2026-01-05T17:40:00Z") });
    expect(findNextDispatchTime(monday, at("2026-01-05T17:35:01Z"), "America/Los_Angeles")).toEqual({ warningAt: at("2026-01-12T16:55:00Z"), startsAt: at("2026-01-12T17:00:00Z") });
    expect(findNextDispatchTime([], at("2026-01-05T17:00:00Z"), "UTC")).toBeNull();
    expect(() => findNextDispatchTime(monday, Infinity, "UTC")).toThrow("Invalid timestamp");
    expect(() => findNextDispatchTime(monday, 0, "Not/AZone")).toThrow("Invalid timezone");
  });

  it("skips nonexistent spring-forward slots and uses the next real occurrence", () => {
    const sunday = [{ dayOfWeek: 0, startMinute: 120, endMinute: 150 }];
    expect(findNextDispatchTime(sunday, at("2026-03-08T08:00:00Z"), "America/Los_Angeles")).toEqual({ warningAt: at("2026-03-15T08:55:00Z"), startsAt: at("2026-03-15T09:00:00Z") });
    const crossed = [{ dayOfWeek: 0, startMinute: 110, endMinute: 190 }];
    expect(findNextDispatchTime(crossed, at("2026-03-08T09:40:00Z"), "America/Los_Angeles")).toEqual({ warningAt: at("2026-03-08T09:45:00Z"), startsAt: at("2026-03-08T09:50:00Z") });
  });

  it("matches both fall-back occurrences and selects the earliest viable real interval", () => {
    const sunday = [{ dayOfWeek: 0, startMinute: 90, endMinute: 120 }];
    expect(isWithinAvailabilityWindow(sunday, at("2026-11-01T08:45:00Z"), "America/Los_Angeles")).toBe(true);
    expect(isWithinAvailabilityWindow(sunday, at("2026-11-01T09:45:00Z"), "America/Los_Angeles")).toBe(true);
    expect(findNextDispatchTime(sunday, at("2026-11-01T08:40:00Z"), "America/Los_Angeles")).toEqual({ warningAt: at("2026-11-01T09:25:00Z"), startsAt: at("2026-11-01T09:30:00Z") });
  });
});
