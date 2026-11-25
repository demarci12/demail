// Send window math in an IANA timezone. send_days bit 0 = Sunday ... bit 6 = Saturday.
const DAY_MS = 86_400_000;
type Parts = { y: number; m: number; d: number; minutes: number; weekday: number };
function safeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
function localParts(date: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(tz),
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, minutes: p.hour * 60 + p.minute, weekday: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
}
// UTC instant of a local wall-clock time (two passes cover offset changes).
function zonedToUtc(y: number, m: number, d: number, minutes: number, tz: string): Date {
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), tz);
    guess += wall - Date.UTC(p.y, p.m - 1, p.d, 0, p.minutes);
  }
  return new Date(guess);
}
export function parseTime(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}
export type Window = { timezone: string; sendDays: number; start: string; end: string };
export function isInWindow(now: Date, w: Window): boolean {
  const p = localParts(now, w.timezone);
  return (w.sendDays & (1 << p.weekday)) !== 0 && p.minutes >= parseTime(w.start) && p.minutes < parseTime(w.end);
}
// Returns now when inside the window, else the next window start, or null when no day is enabled.
export function nextWindowStart(now: Date, w: Window): Date | null {
  if (w.sendDays === 0) return null;
  const today = localParts(now, w.timezone);
  for (let i = 0; i <= 7; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d) + i * DAY_MS);
    if ((w.sendDays & (1 << day.getUTCDay())) === 0) continue;
    const args = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()] as const;
    const start = zonedToUtc(...args, parseTime(w.start), w.timezone);
    const end = zonedToUtc(...args, parseTime(w.end), w.timezone);
    if (end.getTime() <= now.getTime()) continue;
    return start.getTime() > now.getTime() ? start : now;
  }
  return null;
}
// Start of the current local day, used for daily caps.
export function localDayStart(now: Date, tz: string): Date {
  const p = localParts(now, tz);
  return zonedToUtc(p.y, p.m, p.d, 0, tz);
}
