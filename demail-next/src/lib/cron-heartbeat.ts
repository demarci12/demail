import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Runs one scheduler tick and records whether it finished. A failed write never changes the tick's outcome, so a database that predates the table costs nothing.
export async function withHeartbeat<T>(job: string, tick: () => Promise<T>): Promise<T> {
  const started = Date.now();
  let ok = true;
  try {
    return await tick();
  } catch (e) {
    ok = false;
    throw e;
  } finally {
    try {
      await createAdminClient().rpc("record_cron_heartbeat", { p_job: job, p_ok: ok, p_ms: Date.now() - started });
    } catch {
      // The heartbeat is advisory.
    }
  }
}
