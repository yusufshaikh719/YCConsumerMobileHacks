import type { FreeWindow } from "../services/types";

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export const PING_LEAD_MS = MINUTE;

export function minuteOfDay(at: number) {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

function atMinute(day: number, minute: number) {
  const d = new Date(day);
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return d.getTime();
}

export function isInWindow(window: FreeWindow, at: number) {
  const m = minuteOfDay(at);
  return m >= window.startMinute && m < window.endMinute;
}

export function nextWindowStart(window: FreeWindow, at: number) {
  const today = atMinute(at, window.startMinute);
  return today > at ? today : atMinute(at + DAY, window.startMinute);
}

export function pickPingTime(window: FreeWindow, now: number, random: () => number = Math.random) {
  const todayEnd = atMinute(now, window.endMinute) - PING_LEAD_MS;
  const todayStart = Math.max(atMinute(now, window.startMinute), now + PING_LEAD_MS);
  const [start, end] = todayStart < todayEnd ? [todayStart, todayEnd] : [nextWindowStart(window, now + 1), atMinute(nextWindowStart(window, now + 1), window.endMinute) - PING_LEAD_MS];
  return Math.floor(start + random() * Math.max(0, end - start));
}

export function formatClock(minute: number) {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatTimeOfDay(at: number) {
  return formatClock(minuteOfDay(at));
}

export function formatMinSec(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function weekdayShort(at: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(at).getDay()];
}

export function isSameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
