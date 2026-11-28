import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, PageHeader } from "@/components/ui/card";
import { HEARTBEAT_JOBS, jobState, type JobState } from "@/lib/health/jobs";
import { setupChecks } from "@/lib/health/setup";

const STATE_TEXT: Record<JobState, { text: string; tone: string }> = {
  ok: { text: "Running", tone: "text-emerald-700" },
  late: { text: "Late", tone: "text-amber-700" },
  failing: { text: "Last run failed", tone: "text-red-700" },
  never: { text: "Never ran", tone: "text-slate-500" },
};

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export default async function SetupHealthPage() {
  const { canManage } = await getOrgContext();
  if (!canManage) redirect("/app");
  const { data: beats, error } = await createAdminClient().from("cron_heartbeats").select("job, last_run_at, last_ok, last_ms, runs");
  const byJob = new Map((beats ?? []).map((b) => [b.job, b]));
  const checks = setupChecks();
  const missing = checks.filter((c) => c.required && !c.ok);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Setup health" />
      <p className="text-sm text-slate-600">What this instance has configured and whether the scheduler is running. Only whether a setting exists is shown, never its value.</p>
      {missing.length > 0 && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{missing.length} required setting{missing.length === 1 ? " is" : "s are"} missing: {missing.map((m) => m.label).join(", ")}.</p>}
      <Card className="p-0">
        <ul>
          {checks.map((c) => (
            <li key={c.key} className="flex items-start justify-between gap-4 border-b border-slate-100 p-3 text-sm last:border-0">
              <span>
                <span className="font-medium">{c.label}</span>
                <span className="block text-xs text-slate-500">{c.hint}</span>
              </span>
              <span className={`shrink-0 text-xs font-medium ${c.ok ? "text-emerald-700" : c.required ? "text-red-700" : "text-slate-500"}`}>{c.ok ? "Configured" : c.required ? "Missing" : "Not set"}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-0">
        <div className="border-b border-slate-100 p-3 text-sm font-medium">Scheduler</div>
        {error ? (
          <p className="p-3 text-sm text-slate-600">The heartbeat table is not available yet. Apply migration 20260101003500_cron_heartbeats.sql.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last run</th>
                <th className="px-3 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {HEARTBEAT_JOBS.map((j) => {
                const row = byJob.get(j.job);
                const state = STATE_TEXT[jobState(row, j.everySeconds)];
                return (
                  <tr key={j.job} className="border-t border-slate-100">
                    <td className="px-3 py-2">{j.label}</td>
                    <td className={`px-3 py-2 ${state.tone}`}>{state.text}</td>
                    <td className="px-3 py-2 text-slate-600">{row ? ago(row.last_run_at) : "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{row?.last_ms != null ? `${(row.last_ms / 1000).toFixed(1)} s` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="border-t border-slate-100 p-3 text-xs text-slate-500">
          A job that never ran means the scheduler is not set up: run supabase/setup/schedule.sql once. The health and purge jobs run inside Postgres and are not listed.
        </p>
      </Card>
    </div>
  );
}
