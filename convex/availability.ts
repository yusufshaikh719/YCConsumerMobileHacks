import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export type AvailabilitySlot = { dayOfWeek: number; startMinute: number; endMinute: number };

const slotValidator = v.object({ dayOfWeek: v.number(), startMinute: v.number(), endMinute: v.number() });
const minuteMs = 60_000;
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function validateSlots(slots: AvailabilitySlot[]) {
  for (const slot of slots) {
    if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6 ||
        !Number.isInteger(slot.startMinute) || !Number.isInteger(slot.endMinute) ||
        slot.startMinute < 0 || slot.endMinute > 1439 || slot.endMinute - slot.startMinute < 20) {
      throw new Error("Invalid availability slot");
    }
  }
}

function formatterFor(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  } catch {
    throw new Error("Invalid timezone");
  }
}

function matches(slots: AvailabilitySlot[], timestampMs: number, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(timestampMs);
  const weekday = weekdays.indexOf(parts.find(part => part.type === "weekday")!.value);
  const minute = Number(parts.find(part => part.type === "hour")!.value) * 60 +
    Number(parts.find(part => part.type === "minute")!.value);
  return slots.some(slot => slot.dayOfWeek === weekday && minute >= slot.startMinute && minute < slot.endMinute);
}

export function isWithinAvailabilityWindow(slots: AvailabilitySlot[], timestampMs: number, timezone: string) {
  validateSlots(slots);
  const formatter = formatterFor(timezone);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(new Date(timestampMs).getTime())) throw new Error("Invalid timestamp");
  return matches(slots, timestampMs, formatter);
}

export function findNextDispatchTime(slots: AvailabilitySlot[], nowMs: number, timezone: string): { warningAt: number; startsAt: number } | null {
  validateSlots(slots);
  const formatter = formatterFor(timezone);
  if (!Number.isFinite(nowMs) || !Number.isFinite(new Date(nowMs).getTime()) || !Number.isFinite(new Date(nowMs + 15 * 24 * 60 * minuteMs).getTime())) throw new Error("Invalid timestamp");
  if (slots.length === 0) return null;

  const earliestStart = nowMs + 5 * minuteMs;
  const limit = earliestStart + 15 * 24 * 60 * minuteMs;
  let cursor = earliestStart;
  let runStart: number | null = null;
  while (cursor < limit) {
    const next = Math.min(Math.floor(cursor / minuteMs + 1) * minuteMs, limit);
    if (matches(slots, cursor, formatter)) {
      runStart ??= cursor;
      if (next - runStart >= 20 * minuteMs) return { warningAt: runStart - 5 * minuteMs, startsAt: runStart };
    } else {
      runStart = null;
    }
    cursor = next;
  }
  return null;
}

export const setAvailabilityWindows = mutation({
  args: { potId: v.id("pots"), userId: v.id("users"), timezone: v.string(), slots: v.array(slotValidator) },
  handler: async (ctx, args) => {
    validateSlots(args.slots);
    formatterFor(args.timezone);
    if (!await ctx.db.get(args.potId)) throw new Error("Pot not found");
    if (!await ctx.db.get(args.userId)) throw new Error("User not found");
    const existing = await ctx.db.query("availabilityWindows").withIndex("by_pot_user", q => q.eq("potId", args.potId).eq("userId", args.userId)).unique();
    const value = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("availabilityWindows", value);
  },
});

export const getUserAvailability = query({
  args: { potId: v.id("pots"), userId: v.id("users") },
  handler: async (ctx, { potId, userId }) => await ctx.db.query("availabilityWindows")
    .withIndex("by_pot_user", q => q.eq("potId", potId).eq("userId", userId)).unique(),
});
