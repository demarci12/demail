import { localDayStart, nextWindowStart, isInWindow, parseTime, type Window } from "@/lib/send/schedule";
export const WARMUP_START_SHARE = 0.6;
export const MIN_GAP_MS = 4 * 60_000;
const WEEKDAYS = 0b0111110;
const NOON = 12 * 60;
const ONE = 13 * 60;
export type Band = "healthy" | "watch" | "throttled" | "paused";
type Workday = { timezone: string; warmup_start: string; warmup_end: string };
// Daily send target: 10, +1 a day, ceiling 40. Throttled halves it and holds the ramp where it was when the band changed.
export function dailyTarget(startedAt: string | null, now: Date, timezone: string, band: Band, bandChangedAt?: string | null): number {
  const ref = band === "throttled" && bandChangedAt ? new Date(Math.min(now.getTime(), new Date(bandChangedAt).getTime())) : now;
  const from = startedAt ? localDayStart(new Date(startedAt), timezone).getTime() : localDayStart(now, timezone).getTime();
  const days = Math.max(0, Math.round((localDayStart(ref, timezone).getTime() - from) / 86_400_000));
  const base = Math.min(40, 10 + days);
  return band === "throttled" ? Math.max(1, Math.floor(base / 2)) : base;
}
function fmt(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
// Monday to Friday, inside the mailbox workday, outside 12:00 to 13:00 local.
function windows(m: Workday): Window[] {
  const start = parseTime(m.warmup_start);
  const end = parseTime(m.warmup_end);
  const out: Window[] = [];
  if (start < NOON) out.push({ timezone: m.timezone, sendDays: WEEKDAYS, start: fmt(start), end: fmt(Math.min(end, NOON)) });
  if (end > ONE) out.push({ timezone: m.timezone, sendDays: WEEKDAYS, start: fmt(Math.max(start, ONE)), end: fmt(end) });
  return out;
}
export function inWorkday(now: Date, m: Workday): boolean {
  return windows(m).some((w) => isInWindow(now, w));
}
// The first moment at or after `at` that is inside the workday, or null when the mailbox has none.
export function intoWorkday(at: Date, m: Workday): Date | null {
  const times = windows(m)
    .map((w) => nextWindowStart(at, w))
    .filter((d): d is Date => d !== null);
  return times.length === 0 ? null : new Date(Math.min(...times.map((d) => d.getTime())));
}
