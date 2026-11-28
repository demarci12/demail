// Cold-send ramp-up: the daily limit of a mailbox rises by a step each week from a start value until it reaches the mailbox's own cap.
const WEEK_MS = 7 * 86_400_000;
export type Ramp = { enabled: boolean; start: number; step: number; startedAt: string | null };
// The ramp never raises the cap; the lowest limit applies. A ramp with no start time yet counts as week 1.
export function rampLimit(ramp: Ramp, cap: number, now: Date): number {
  if (!ramp.enabled) return cap;
  const started = ramp.startedAt ? new Date(ramp.startedAt).getTime() : now.getTime();
  const weeks = Math.max(0, Math.floor((now.getTime() - started) / WEEK_MS));
  return Math.max(1, Math.min(cap, ramp.start + ramp.step * weeks));
}
