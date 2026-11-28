// HTTP scheduler jobs that record a heartbeat. Add a job here when its route calls withHeartbeat.
export const HEARTBEAT_JOBS = [
  { job: "send", label: "Send tick", everySeconds: 60 },
  { job: "sync", label: "Reply sync", everySeconds: 60 },
  { job: "warmup", label: "Warmup", everySeconds: 60 },
  { job: "ai", label: "AI reply classification", everySeconds: 60 },
  { job: "crm", label: "HubSpot sync", everySeconds: 300 },
  { job: "verify", label: "Email verification", everySeconds: 120 },
  { job: "domains", label: "Domain checks", everySeconds: 3600 },
] as const;

export type JobState = "never" | "ok" | "late" | "failing";

// A job is late after three missed intervals (at least five minutes), and failing when its last run threw.
export function jobState(row: { last_run_at: string; last_ok: boolean } | undefined, everySeconds: number, now = Date.now()): JobState {
  if (!row) return "never";
  if (!row.last_ok) return "failing";
  const lateAfterMs = Math.max(everySeconds * 3, 300) * 1000;
  return now - new Date(row.last_run_at).getTime() > lateAfterMs ? "late" : "ok";
}
