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

export function activeWindow(windows: FreeWindow[], at: number) {
  const m = minuteOfDay(at);
  return windows.find(w => m >= w.startMinute && m < w.endMinute) ?? null;
}

export const isInWindows = (windows: FreeWindow[], at: number) => activeWindow(windows, at) !== null;

export function nextWindowStart(windows: FreeWindow[], at: number) {
  const starts = [0, 1].flatMap(day => windows.map(w => atMinute(at + day * DAY, w.startMinute))).filter(start => start > at);
  return starts.length ? Math.min(...starts) : null;
}

export function pickPingTime(windows: FreeWindow[], now: number, random: () => number = Math.random) {
  for (const day of [0, 1]) {
    const spans = windows
      .map(w => [Math.max(atMinute(now + day * DAY, w.startMinute), now + PING_LEAD_MS), atMinute(now + day * DAY, w.endMinute) - PING_LEAD_MS] as const)
      .filter(([start, end]) => end > start)
      .sort((a, b) => a[0] - b[0]);
    const total = spans.reduce((sum, [start, end]) => sum + end - start, 0);
    if (!total) continue;
    let offset = Math.min(random(), 0.999999) * total;
    for (const [start, end] of spans) {
      if (offset < end - start) return Math.floor(start + offset);
      offset -= end - start;
    }
  }
  return null;
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
