import type { FreeWindow } from "../services/types";

export const STEP = 30;
export const MIN_SPAN = 60;
export const DAY_START = 6 * 60;
export const LAST_END = 24 * 60 - STEP;
export const MAX_WINDOWS = 4;
export const DEFAULT_WINDOWS: FreeWindow[] = [{ startMinute: 15 * 60, endMinute: 18 * 60 }];

export const sortWindows = (windows: FreeWindow[]) => [...windows].sort((a, b) => a.startMinute - b.startMinute);

export function overlaps(windows: FreeWindow[]) {
  const sorted = sortWindows(windows);
  return sorted.some((w, i) => i > 0 && w.startMinute < sorted[i - 1].endMinute);
}

export function validWindows(windows: FreeWindow[]) {
  return (
    windows.length > 0 &&
    windows.length <= MAX_WINDOWS &&
    !overlaps(windows) &&
    windows.every(w => w.startMinute >= DAY_START && w.endMinute <= LAST_END && w.endMinute - w.startMinute >= MIN_SPAN)
  );
}

export function boundsFor(sorted: FreeWindow[], index: number) {
  const w = sorted[index];
  return {
    startMin: sorted[index - 1]?.endMinute ?? DAY_START,
    startMax: w.endMinute - MIN_SPAN,
    endMin: w.startMinute + MIN_SPAN,
    endMax: sorted[index + 1]?.startMinute ?? LAST_END,
  };
}

export const fits = (windows: FreeWindow[], index: number, candidate: FreeWindow) => !overlaps(windows.map((w, i) => (i === index ? candidate : w)));

export function addWindow(windows: FreeWindow[]): FreeWindow[] | null {
  if (windows.length >= MAX_WINDOWS) return null;
  const sorted = sortWindows(windows);
  const gaps = Array.from({ length: sorted.length + 1 }, (_, i) => ({ from: sorted[i - 1]?.endMinute ?? DAY_START, to: sorted[i]?.startMinute ?? LAST_END }))
    .filter(gap => gap.to - gap.from >= MIN_SPAN);
  if (!gaps.length) return null;
  const after = gaps.filter(gap => gap.from > DAY_START);
  const gap = after.length ? after[after.length - 1] : gaps[0];
  const buffer = gap.from === DAY_START ? 0 : Math.min(MIN_SPAN, Math.floor((gap.to - gap.from - MIN_SPAN) / STEP) * STEP);
  const startMinute = gap.from + buffer;
  return sortWindows([...sorted, { startMinute, endMinute: Math.min(gap.to, startMinute + 2 * MIN_SPAN) }]);
}

export const sameWindows = (a: FreeWindow[], b: FreeWindow[]) => JSON.stringify(sortWindows(a)) === JSON.stringify(sortWindows(b));

export function parseInviteCode(input: string) {
  const code = input.trim().split(/[/\s]+/).filter(Boolean).pop()?.toUpperCase() ?? "";
  return /^[A-Z0-9]{4,8}$/.test(code) ? code : null;
}
