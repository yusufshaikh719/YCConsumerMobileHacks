import { v } from "convex/values";

export const habitCategory = v.union(v.literal("fitness"), v.literal("coding"), v.literal("wakeup"), v.literal("custom"));
export const persona = v.union(v.literal("drill_sergeant"), v.literal("passive_aggressive_roommate"), v.literal("wall_street_bro"), v.literal("disappointed_coach"));
export const verdict = v.union(v.literal("pending"), v.literal("passed"), v.literal("failed_habit"), v.literal("failed_spoof"));
export const evaluationMode = v.union(v.literal("live"), v.literal("fallback"), v.literal("demo_override"));
export const transferStatus = v.union(v.literal("pending"), v.literal("completed"), v.literal("fallback"));
export const transferMode = v.union(v.literal("live"), v.literal("fallback"));
export type HabitCategory = "fitness" | "coding" | "wakeup" | "custom";
export type PersonaId = "drill_sergeant" | "passive_aggressive_roommate" | "wall_street_bro" | "disappointed_coach";
export const PERSONA_IDS: PersonaId[] = ["drill_sergeant", "passive_aggressive_roommate", "wall_street_bro", "disappointed_coach"];
export const DEFAULT_STAKE_CENTS = 1000;
export const POT_DAYS = 7;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function nextCutoff(now: number, hour: number): number {
  const date = new Date(now);
  date.setUTCHours(hour, 0, 0, 0);
  return date.getTime() > now ? date.getTime() : date.getTime() + DAY_MS;
}
