import "server-only";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";
import { fileDisplayName } from "@/lib/forms/files";
import { signConfirmToken } from "@/lib/forms/token";
import { cleanText, parseFields } from "@/lib/input";
import { MailAuthError } from "@/lib/mail/credentials";
import { sendThrough } from "@/lib/mail/send";
import type { OutgoingMail } from "@/lib/mail/types";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
type Job = Database["public"]["Tables"]["form_mail_jobs"]["Row"];
type Mailbox = Database["public"]["Tables"]["mailboxes"]["Row"];
export type FormsTickResult = { claimed: number; sent: number; skipped: number; deferred: number; failed: number; files_removed: number };
const MAX_ATTEMPTS = 5;
const RETRY_MS = 5 * 60_000;
const DEFER_MS = 60 * 60_000;
const STALE_MS = 3 * 24 * 60 * 60_000;
const BATCH = 10;
const BUCKET = "form-files";

const plus = (ms: number) => new Date(Date.now() + ms).toISOString();
const line = (value: unknown, max = 300) => cleanText(typeof value === "string" ? value : value === true ? "Yes" : "", max);

function sender(m: Mailbox) {
  const name = m.from_name.replace(/["<>\r\n]/g, "").trim();
  return name ? `${name} <${m.email}>` : m.email;
}

// One scheduler tick: sends a bounded batch of form mail, then removes the files of deleted submissions.
export async function runFormsTick(): Promise<FormsTickResult> {
  const admin = createAdminClient();
  const result: FormsTickResult = { claimed: 0, sent: 0, skipped: 0, deferred: 0, failed: 0, files_removed: 0 };
  result.files_removed = await removeDeletedFiles(admin);
  const { data: jobs, error } = await admin.rpc("claim_form_mail", { batch: BATCH });
  // Before migration 003800 there is no outbox, so there is nothing to send.
  if (error?.code === "PGRST202") return result;
  if (error) throw new Error(`claim_form_mail failed: ${error.message}`);
  result.claimed = (jobs ?? []).length;
  for (const job of jobs ?? []) {
    const outcome = await handle(admin, job);
    result[outcome]++;
  }
  // Mail rows are bookkeeping: keep 30 days.
  await admin.from("form_mail_jobs").delete().neq("status", "pending").lt("created_at", plus(-30 * 24 * 60 * 60_000));
  return result;
}

async function finish(admin: Admin, job: Job, patch: Partial<Pick<Job, "status" | "last_error" | "sent_at" | "next_attempt_at">>) {
  await admin.from("form_mail_jobs").update(patch).eq("id", job.id).eq("organization_id", job.organization_id);
}
const skip = async (admin: Admin, job: Job, why: string): Promise<"skipped"> => {
  await finish(admin, job, { status: "skipped", last_error: why });
  return "skipped";
};

async function handle(admin: Admin, job: Job): Promise<"sent" | "skipped" | "deferred" | "failed"> {
  if (Date.now() - new Date(job.created_at).getTime() > STALE_MS) return skip(admin, job, "Too old to send");
  const { data: form } = await admin.from("forms").select("*").eq("id", job.form_id).eq("organization_id", job.organization_id).maybeSingle();
  if (!form) return skip(admin, job, "Form is gone");
  if (!form.mail_mailbox_id) return skip(admin, job, "No sender mailbox is chosen");
  const { data: mailbox } = await admin.from("mailboxes").select("*").eq("id", form.mail_mailbox_id).eq("organization_id", job.organization_id).maybeSingle();
  if (!mailbox) return skip(admin, job, "Sender mailbox is gone");
  if (mailbox.status !== "active") {
    await finish(admin, job, { next_attempt_at: plus(DEFER_MS), last_error: "Sender mailbox is not active" });
    return "deferred";
  }
  const { data: submission } = await admin.from("form_submissions").select("*").eq("id", job.submission_id).eq("organization_id", job.organization_id).maybeSingle();
  if (!submission) return skip(admin, job, "Submission is gone");
  const { data: contact } = await admin.from("contacts").select("id, email").eq("id", submission.contact_id).eq("organization_id", job.organization_id).maybeSingle();
  if (!contact) return skip(admin, job, "Contact is gone");

  let mail: Omit<OutgoingMail, "from" | "idempotencyKey" | "unsubscribeUrl" | "oneClickUrl">;
  if (job.kind === "confirm") {
    const { data: confirmation } = await admin.from("form_confirmations").select("*").eq("id", job.confirmation_id ?? "").eq("organization_id", job.organization_id).maybeSingle();
    if (!confirmation || confirmation.confirmed_at || new Date(confirmation.expires_at).getTime() <= Date.now()) return skip(admin, job, "Link is used or expired");
    if (!form.double_opt_in) return skip(admin, job, "Double opt-in is off");
    const name = line(form.title || form.name, 80) || "our form";
    const link = `${publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/f/confirm/${signConfirmToken(confirmation.id)}`;
    mail = {
      to: contact.email,
      subject: `Confirm your email address for ${name}`,
      text: `Please confirm your email address to finish signing up.\n\nConfirm: ${link}\n\nThe link works once and expires in 72 hours. If you did not ask for this, ignore this email and nothing will happen.`,
    };
  } else {
    if (!form.notify_enabled) return skip(admin, job, "Notifications are off");
    const userId = job.recipient_user_id;
    if (!userId) return skip(admin, job, "No recipient");
    const { data: recipient } = await admin.from("form_notify_recipients").select("user_id").eq("form_id", job.form_id).eq("user_id", userId).eq("organization_id", job.organization_id).maybeSingle();
    if (!recipient) return skip(admin, job, "Recipient was removed");
    const { data: user } = await admin.auth.admin.getUserById(userId);
    const to = user.user?.email;
    if (!to) return skip(admin, job, "Recipient has no email");
    const { data: files } = await admin.from("form_files").select("original_name, content_type").eq("submission_id", submission.id).eq("organization_id", job.organization_id).eq("status", "stored");
    const labels = new Map((parseFields(form.fields) ?? []).map((f) => [f.key, f.label]));
    const answers = submission.answers && typeof submission.answers === "object" && !Array.isArray(submission.answers) ? Object.entries(submission.answers) : [];
    const optin = !form.double_opt_in ? "Not used" : submission.optin_confirmed_at ? "Confirmed" : "Waiting for the visitor to confirm";
    // Plain text only: submitted text is never put into HTML.
    const body = [
      `A new submission arrived on "${line(form.name, 100)}".`,
      `Contact: ${contact.email}`,
      ...answers.slice(0, 20).map(([key, value]) => `${line(labels.get(key) ?? key, 100)}: ${line(value)}`),
      ...(files ?? []).map((f) => `File: ${fileDisplayName(f.original_name, f.content_type)}`),
      `Double opt-in: ${optin}`,
      `Open it: ${publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/app/forms/${form.id}/submissions`,
    ].join("\n");
    mail = { to, subject: `New submission: ${line(form.name, 100)}`, text: body };
  }

  // The mailbox's daily limit also counts form mail sent by this workspace in the last day (shortcut: workspace-wide, not per mailbox).
  const { data: sentToday } = await admin.rpc("count_sent_today", { p_mailbox: mailbox.id });
  const { count: formSent } = await admin
    .from("form_mail_jobs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", job.organization_id)
    .eq("status", "sent")
    .gte("sent_at", plus(-24 * 60 * 60_000));
  if ((sentToday ?? 0) + (formSent ?? 0) >= mailbox.daily_limit) {
    await finish(admin, job, { next_attempt_at: plus(DEFER_MS), last_error: "Mailbox daily limit reached" });
    return "deferred";
  }

  try {
    const outcome = await sendThrough(admin, mailbox, { ...mail, from: sender(mailbox), replyTo: mailbox.reply_to, unsubscribeUrl: "", oneClickUrl: "", idempotencyKey: `form-mail-${job.id}`, plain: true });
    if (outcome.ok) {
      await finish(admin, job, { status: "sent", sent_at: new Date().toISOString(), last_error: null });
      return "sent";
    }
    if (outcome.retryable && job.attempts < MAX_ATTEMPTS) {
      await finish(admin, job, { next_attempt_at: plus(outcome.retryAfterMs ?? RETRY_MS), last_error: outcome.message.slice(0, 300) });
      return "deferred";
    }
    await finish(admin, job, { status: "failed", last_error: outcome.message.slice(0, 300) });
    return "failed";
  } catch (e) {
    if (!(e instanceof MailAuthError)) throw e;
    await finish(admin, job, { next_attempt_at: plus(DEFER_MS), last_error: "Reconnect the sender mailbox" });
    return "deferred";
  }
}

// Files of deleted submissions, contacts, forms and workspaces; uploads that never finished are dropped after an hour.
async function removeDeletedFiles(admin: Admin): Promise<number> {
  await admin.from("form_files").delete().eq("status", "pending").lt("created_at", plus(-60 * 60_000));
  const { data: queued } = await admin.from("form_file_deletions").select("id, storage_path").order("id").limit(100);
  if (!queued?.length) return 0;
  const { error } = await admin.storage.from(BUCKET).remove(queued.map((q) => q.storage_path));
  if (error) return 0;
  await admin.from("form_file_deletions").delete().in("id", queued.map((q) => q.id));
  return queued.length;
}
