"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { EMAIL_PATTERN } from "@/lib/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendManual } from "@/lib/mail/manual";
import { runSyncTick } from "@/lib/sync/run";
const body = z.string().trim().min(1).max(20000);
const subject = z.string().trim().min(1).max(300);
const to = z.string().trim().toLowerCase().regex(EMAIL_PATTERN).max(320);
const fail = (path: string, message: string): never => redirect(`${path}?error=${encodeURIComponent(message)}`);
const SYNC_MIN_AGE_MS = 30_000;
export async function replyToThread(threadId: string, formData: FormData) {
  const path = `/app/unibox/${threadId}`;
  const { supabase, org } = await getOrgContext();
  const text = body.safeParse(formData.get("body"));
  if (!text.success) return fail(path, "Write a message of up to 20000 characters.");
  const { data: thread } = await supabase.from("threads").select("*").eq("id", threadId).eq("organization_id", org.id).maybeSingle();
  if (!thread) return fail("/app/unibox", "Thread not found.");
  const { data: mailbox } = await supabase.from("mailboxes").select("*").eq("id", thread.mailbox_id).eq("organization_id", org.id).maybeSingle();
  if (!mailbox) return fail(path, "The mailbox for this thread no longer exists.");
  const { data: msgs } = await supabase.from("thread_messages").select("*").eq("thread_id", thread.id).eq("organization_id", org.id).order("sent_at", { ascending: true });
  const all = msgs ?? [];
  const lastIn = [...all].reverse().find((m) => m.direction === "in" && m.kind === "reply");
  const recipient = lastIn?.from_email ?? all.find((m) => m.direction === "out")?.to_emails[0];
  if (!recipient) return fail(path, "There is no one to reply to in this thread.");
  const base = (thread.subject ?? "").replace(/^(re:\s*)+/i, "");
  const refs = all.map((m) => m.rfc_message_id).filter((v): v is string => !!v);
  const admin = createAdminClient();
  const outcome = await sendManual(admin, mailbox, {
    to: recipient,
    subject: `Re: ${base}`,
    text: text.data,
    thread: { providerThreadId: thread.provider_thread_id, inReplyToRfcId: lastIn?.rfc_message_id ?? refs[refs.length - 1] ?? null, references: refs },
  });
  if (!outcome.ok) return fail(path, outcome.message);
  const sentAt = new Date().toISOString();
  await admin.from("thread_messages").insert({
    organization_id: org.id,
    thread_id: thread.id,
    direction: "out",
    kind: "sent",
    provider_message_id: outcome.id,
    rfc_message_id: outcome.rfcMessageId ?? null,
    from_email: mailbox.email,
    from_name: mailbox.from_name,
    to_emails: [recipient],
    subject: `Re: ${base}`,
    body_text: text.data,
    sent_at: sentAt,
  });
  await admin.from("threads").update({ last_message_at: sentAt, snippet: text.data.replace(/\s+/g, " ").slice(0, 200), is_unread: false }).eq("id", thread.id).eq("organization_id", org.id);
  revalidatePath("/app/unibox");
  redirect(path);
}
export async function composeMessage(formData: FormData) {
  const path = "/app/unibox/compose";
  const { supabase, org } = await getOrgContext();
  const parsed = z.object({ mailbox: z.string().uuid(), to, subject, body }).safeParse({
    mailbox: formData.get("mailbox"),
    to: formData.get("to"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return fail(path, "Check the mailbox, recipient, subject and message.");
  const { data: mailbox } = await supabase.from("mailboxes").select("*").eq("id", parsed.data.mailbox).eq("organization_id", org.id).maybeSingle();
  if (!mailbox || mailbox.status !== "active" || mailbox.provider === "resend") return fail(path, "Choose an active Google or Microsoft mailbox.");
  const admin = createAdminClient();
  const outcome = await sendManual(admin, mailbox, { to: parsed.data.to, subject: parsed.data.subject, text: parsed.data.body });
  if (!outcome.ok) return fail(path, outcome.message);
  const sentAt = new Date().toISOString();
  const { data: contact } = await admin.from("contacts").select("id").eq("organization_id", org.id).eq("email", parsed.data.to).maybeSingle();
  const { data: thread } = await admin
    .from("threads")
    .upsert(
      {
        organization_id: org.id,
        mailbox_id: mailbox.id,
        provider_thread_id: outcome.providerThreadId ?? outcome.id,
        subject: parsed.data.subject,
        contact_id: contact?.id ?? null,
        snippet: parsed.data.body.replace(/\s+/g, " ").slice(0, 200),
        last_message_at: sentAt,
        is_unread: false,
      },
      { onConflict: "mailbox_id,provider_thread_id" },
    )
    .select("id")
    .single();
  if (!thread) return fail("/app/unibox", "The message was sent but could not be saved to the unibox.");
  await admin.from("thread_messages").insert({
    organization_id: org.id,
    thread_id: thread.id,
    direction: "out",
    kind: "sent",
    provider_message_id: outcome.id,
    rfc_message_id: outcome.rfcMessageId ?? null,
    from_email: mailbox.email,
    from_name: mailbox.from_name,
    to_emails: [parsed.data.to],
    subject: parsed.data.subject,
    body_text: parsed.data.body,
    sent_at: sentAt,
  });
  revalidatePath("/app/unibox");
  redirect(`/app/unibox/${thread.id}`);
}
export async function setThreadStatus(threadId: string, status: "open" | "archived") {
  const { supabase, org } = await getOrgContext();
  await supabase.from("threads").update({ status }).eq("id", threadId).eq("organization_id", org.id);
  revalidatePath("/app/unibox");
  revalidatePath(`/app/unibox/${threadId}`);
}
export async function markThreadRead(threadId: string) {
  const { supabase, org } = await getOrgContext();
  await supabase.from("threads").update({ is_unread: false }).eq("id", threadId).eq("organization_id", org.id).eq("is_unread", true);
}
// Syncs this workspace's mailboxes now, at most once every 30 seconds.
export async function syncNow() {
  const { supabase, org } = await getOrgContext();
  const { data: boxes } = await supabase.from("mailboxes").select("id, last_synced_at").eq("organization_id", org.id).eq("status", "active").in("provider", ["google", "microsoft"]);
  const list = boxes ?? [];
  if (list.length === 0) return fail("/app/unibox", "Connect a Google or Microsoft mailbox first.");
  const oldest = Math.min(...list.map((b) => (b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0)));
  if (Date.now() - oldest < SYNC_MIN_AGE_MS) return fail("/app/unibox", "Synced a moment ago. Try again in 30 seconds.");
  const admin = createAdminClient();
  await admin.from("mailbox_sync_state").update({ next_sync_at: new Date().toISOString() }).in("mailbox_id", list.map((b) => b.id)).eq("organization_id", org.id);
  await runSyncTick({ organizationId: org.id });
  revalidatePath("/app/unibox");
  redirect("/app/unibox");
}
