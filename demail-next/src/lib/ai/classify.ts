import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiCall } from "@/lib/ai/run";
import { AiError } from "@/lib/ai/provider";
import { classifyMessages } from "@/lib/ai/prompts";
import { parseIntent } from "@/lib/ai/shared";
type Admin = SupabaseClient<Database>;
type Claimed = Database["public"]["Tables"]["reply_intents"]["Row"];
type IntentUpdate = Database["public"]["Tables"]["reply_intents"]["Update"];
const BUDGET_MS = 45_000;
const BATCH = 10;
const RETRY_MS = 10 * 60_000;
const UNAVAILABLE_MS = 60 * 60_000;
function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
async function updateRow(admin: Admin, row: Claimed, patch: IntentUpdate) {
  await admin.from("reply_intents").update(patch).eq("thread_message_id", row.thread_message_id).eq("organization_id", row.organization_id);
}
async function classifyOne(admin: Admin, row: Claimed): Promise<boolean> {
  const [{ data: message }, { data: thread }] = await Promise.all([
    admin
      .from("thread_messages")
      .select("id, organization_id, from_email, subject, body_text")
      .eq("id", row.thread_message_id)
      .eq("organization_id", row.organization_id)
      .maybeSingle(),
    admin.from("threads").select("subject").eq("id", row.thread_id).eq("organization_id", row.organization_id).maybeSingle(),
  ]);
  if (!message || !thread) {
    await updateRow(admin, row, { status: "failed", attempts: 3, lease_until: null });
    console.error("reply classification failed", { message: row.thread_message_id, code: "missing" });
    return false;
  }
  let code = "bad_output";
  try {
    const text = await aiCall(
      admin,
      row.organization_id,
      classifyMessages({ subject: message.subject ?? thread.subject, fromEmail: message.from_email, body: message.body_text }),
      { maxTokens: 150, temperature: 0 },
    );
    const parsed = parseIntent(text);
    if (parsed) {
      await updateRow(admin, row, { status: "done", intent: parsed.intent, summary: parsed.summary, lease_until: null, next_attempt_at: null });
      await admin.from("threads").update({ intent: parsed.intent }).eq("id", row.thread_id).eq("organization_id", row.organization_id);
      return true;
    }
  } catch (e) {
    code = e instanceof AiError ? e.code : "error";
  }
  const now = new Date();
  // A limit or a missing key parks the row without burning an attempt.
  if (code === "limit" || code === "off" || code === "no_key") {
    const at = code === "limit" ? nextUtcMidnight(now) : new Date(now.getTime() + UNAVAILABLE_MS);
    await updateRow(admin, row, { status: "failed", attempts: Math.max(row.attempts - 1, 0), lease_until: null, next_attempt_at: at.toISOString() });
  } else {
    await updateRow(admin, row, { status: "failed", lease_until: null, next_attempt_at: new Date(now.getTime() + RETRY_MS * row.attempts).toISOString() });
  }
  console.error("reply classification failed", { message: row.thread_message_id, code });
  return false;
}
// Classifies claimed replies; stores the verdict only and never acts on it.
export async function runAiTick(): Promise<{ claimed: number; done: number; failed: number }> {
  const started = Date.now();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_reply_classifications", { batch: BATCH });
  if (error) throw new Error("claim_reply_classifications failed");
  const rows = data ?? [];
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    if (Date.now() - started > BUDGET_MS) break;
    if (await classifyOne(admin, row)) done++;
    else failed++;
  }
  return { claimed: rows.length, done, failed };
}
