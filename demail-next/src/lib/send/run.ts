import "server-only";
import { serverEnv, publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { contactData, escapeHtml, renderTemplate } from "@/lib/merge";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "@/lib/unsubscribe";
import { sendMail } from "@/lib/email/resend";
import { localDayStart, nextWindowStart } from "./schedule";
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
type Campaign = Row<"campaigns">;
type Step = Row<"campaign_steps">;
type Mailbox = Row<"mailboxes">;
type Enrollment = Row<"campaign_contacts">;
export type TickResult = { claimed: number; sent: number; waited: number; deferred: number; stopped: number; failed: number; completed: number };
const MAX_ATTEMPTS = 5;
const RETRY_MS = 5 * 60_000;
const DEFER_MS = 15 * 60_000;
function plus(now: Date, ms: number) {
  return new Date(now.getTime() + ms).toISOString();
}
function nextUtcMidnight(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}
function senderAddress(m: Mailbox) {
  const name = m.from_name.replace(/["<>\r\n]/g, "").trim();
  return name ? `${name} <${m.email}>` : m.email;
}
function htmlFromPlain(text: string) {
  return `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
}
// One scheduler tick: claims a bounded batch of due enrollments and advances each by one step.
export async function runSendTick(now = new Date()): Promise<TickResult> {
  const env = serverEnv();
  const baseUrl = publicEnv().NEXT_PUBLIC_APP_URL;
  const admin = createAdminClient();
  const result: TickResult = { claimed: 0, sent: 0, waited: 0, deferred: 0, stopped: 0, failed: 0, completed: 0 };
  const { data: claimed, error } = await admin.rpc("claim_due_enrollments", { batch: env.SEND_BATCH_SIZE });
  if (error) throw new Error(`claim_due_enrollments failed: ${error.message}`);
  const rows = claimed ?? [];
  result.claimed = rows.length;
  if (rows.length === 0) return result;
  const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { count: sentToday } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", utcStart.toISOString());
  let instanceLeft = env.INSTANCE_DAILY_SEND_CAP - (sentToday ?? 0);
  const campaigns = new Map<string, { campaign: Campaign; steps: Step[]; mailboxes: Mailbox[] } | null>();
  const mailboxSent = new Map<string, number>();
  const mailboxLast = new Map<string, number>();
  const campaignSent = new Map<string, number>();
  async function loadCampaign(id: string) {
    if (campaigns.has(id)) return campaigns.get(id)!;
    const { data: campaign } = await admin.from("campaigns").select("*").eq("id", id).maybeSingle();
    let entry = null;
    if (campaign) {
      const [{ data: steps }, { data: links }] = await Promise.all([
        admin.from("campaign_steps").select("*").eq("campaign_id", id).order("position"),
        admin.from("campaign_mailboxes").select("mailbox_id").eq("campaign_id", id),
      ]);
      const ids = (links ?? []).map((l) => l.mailbox_id);
      const { data: boxes } = ids.length ? await admin.from("mailboxes").select("*").in("id", ids).eq("status", "active") : { data: [] as Mailbox[] };
      entry = { campaign, steps: steps ?? [], mailboxes: boxes ?? [] };
    }
    campaigns.set(id, entry);
    return entry;
  }
  async function mailboxState(m: Mailbox) {
    if (!mailboxSent.has(m.id)) {
      const { data } = await admin.rpc("count_sent_today", { p_mailbox: m.id });
      const { data: last } = await admin.from("messages").select("sent_at").eq("mailbox_id", m.id).eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle();
      mailboxSent.set(m.id, data ?? 0);
      mailboxLast.set(m.id, last?.sent_at ? new Date(last.sent_at).getTime() : 0);
    }
    return { sent: mailboxSent.get(m.id)!, last: mailboxLast.get(m.id)! };
  }
  async function campaignSentToday(c: Campaign) {
    if (!campaignSent.has(c.id)) {
      const { count } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)
        .eq("status", "sent")
        .gte("sent_at", localDayStart(now, c.timezone).toISOString());
      campaignSent.set(c.id, count ?? 0);
    }
    return campaignSent.get(c.id)!;
  }
  const update = (e: Enrollment, patch: Database["public"]["Tables"]["campaign_contacts"]["Update"]) =>
    admin.from("campaign_contacts").update(patch).eq("id", e.id).eq("organization_id", e.organization_id);
  async function logMessage(e: Enrollment, step: Step | null, mailboxId: string | null, status: Row<"messages">["status"], extra: { subject?: string; error?: string; resend_id?: string }) {
    await admin.from("messages").insert({
      organization_id: e.organization_id,
      campaign_id: e.campaign_id,
      contact_id: e.contact_id,
      step_id: step?.id ?? null,
      mailbox_id: mailboxId,
      status,
      idempotency_key: `${e.id}:${step?.position ?? "x"}:${status}`,
      subject: extra.subject ?? null,
      error: extra.error ?? null,
      resend_id: extra.resend_id ?? null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });
  }
  async function advance(e: Enrollment, steps: Step[], from: Step, patch: Database["public"]["Tables"]["campaign_contacts"]["Update"]) {
    const next = steps.find((s) => s.position > from.position);
    if (!next) {
      await update(e, { ...patch, status: "completed", next_send_at: null, current_step: from.position + 1 });
      result.completed++;
    } else {
      await update(e, { ...patch, current_step: next.position, next_send_at: patch.next_send_at ?? new Date().toISOString() });
    }
  }
  async function defer(e: Enrollment, until: string) {
    await update(e, { next_send_at: until });
    result.deferred++;
  }
  async function fail(e: Enrollment, step: Step | null, mailboxId: string | null, message: string) {
    await logMessage(e, step, mailboxId, "failed", { error: message });
    await update(e, { status: "failed", next_send_at: null, error: message.slice(0, 500) });
    result.failed++;
  }
  for (const e of rows) {
    const entry = await loadCampaign(e.campaign_id);
    if (!entry) {
      await update(e, { status: "stopped", next_send_at: null, error: "Campaign not found" });
      result.stopped++;
      continue;
    }
    const { campaign, steps, mailboxes } = entry;
    const { data: contact } = await admin.from("contacts").select("*").eq("id", e.contact_id).eq("organization_id", e.organization_id).maybeSingle();
    if (!contact) {
      await update(e, { status: "stopped", next_send_at: null, error: "Contact not found" });
      result.stopped++;
      continue;
    }
    const step = steps.find((s) => s.position === e.current_step) ?? null;
    // A suppressed or unsubscribed contact is never mailed; the enrollment stops.
    const { data: suppressed } = await admin
      .from("suppressed_recipients")
      .select("id, expires_at")
      .eq("organization_id", e.organization_id)
      .ilike("email", contact.email.replace(/[\\%_]/g, "\\$&"));
    const blocked = (suppressed ?? []).some((s) => !s.expires_at || new Date(s.expires_at) > now);
    if (!contact.subscribed || blocked) {
      await logMessage(e, step, null, "skipped", { error: "Unsubscribed or suppressed" });
      await update(e, { status: "stopped", next_send_at: null, error: "Unsubscribed or suppressed" });
      result.stopped++;
      continue;
    }
    if (!step) {
      await update(e, { status: "completed", next_send_at: null });
      result.completed++;
      continue;
    }
    if (step.type === "wait") {
      const until = plus(now, (step.wait_seconds ?? 0) * 1000);
      const next = steps.find((s) => s.position > step.position);
      if (next) await update(e, { current_step: next.position, next_send_at: until, attempts: 0 });
      else {
        await update(e, { status: "completed", next_send_at: null, current_step: step.position + 1 });
        result.completed++;
      }
      result.waited++;
      continue;
    }
    const window = { timezone: campaign.timezone, sendDays: campaign.send_days, start: campaign.send_start, end: campaign.send_end };
    const start = nextWindowStart(now, window);
    if (!start) {
      await defer(e, plus(now, 24 * 3_600_000));
      continue;
    }
    if (start.getTime() > now.getTime()) {
      await defer(e, start.toISOString());
      continue;
    }
    if (instanceLeft <= 0) {
      await defer(e, nextUtcMidnight(now));
      continue;
    }
    if (campaign.daily_limit !== null && (await campaignSentToday(campaign)) >= campaign.daily_limit) {
      await defer(e, plus(now, DEFER_MS));
      continue;
    }
    // Keep the enrollment on its mailbox while it is usable, otherwise pick the least used one.
    const ordered = [...mailboxes].sort((a, b) => (a.id === e.mailbox_id ? -1 : b.id === e.mailbox_id ? 1 : 0));
    let chosen: Mailbox | null = null;
    let retryAt = now.getTime() + DEFER_MS;
    const eligible: { m: Mailbox; sent: number }[] = [];
    for (const m of ordered) {
      const st = await mailboxState(m);
      const gapEnds = st.last + m.min_gap_seconds * 1000;
      if (st.sent >= m.daily_limit) continue;
      if (gapEnds > now.getTime()) {
        retryAt = Math.min(retryAt, gapEnds);
        continue;
      }
      eligible.push({ m, sent: st.sent });
    }
    if (eligible.length) {
      const pinned = eligible.find((x) => x.m.id === e.mailbox_id);
      chosen = (pinned ?? eligible.sort((a, b) => a.sent - b.sent)[0]).m;
    }
    if (!chosen) {
      await defer(e, new Date(Math.max(retryAt, now.getTime() + 1000)).toISOString());
      continue;
    }
    const data = contactData(contact);
    const subject = renderTemplate(step.subject ?? "", data);
    const text = renderTemplate(step.body_plain ?? "", data);
    const html = step.body_html ? renderTemplate(step.body_html, data, escapeHtml) : null;
    const missing = [subject, text, html].flatMap((r) => (r && !r.ok ? r.missing : []));
    if (!subject.ok || !text.ok || (html && !html.ok)) {
      await fail(e, step, chosen.id, `Missing merge field: ${[...new Set(missing)].join(", ")}`);
      continue;
    }
    const key = `${e.id}:${step.position}`;
    const { data: prior } = await admin.from("messages").select("id").eq("idempotency_key", key).maybeSingle();
    if (prior) {
      await advance(e, steps, step, { attempts: 0 });
      continue;
    }
    const link = unsubscribeUrl(baseUrl, e.organization_id, contact.id);
    const sigPlain = chosen.signature_plain ? `\n\n${chosen.signature_plain}` : "";
    const outText = `${text.text}${sigPlain}\n\n--\nTo stop receiving these emails: ${link}`;
    const footer = `<p style="font-size:12px;color:#64748b"><a href="${escapeHtml(link)}">Unsubscribe</a></p>`;
    const body = html?.ok ? html.text : htmlFromPlain(text.text + sigPlain);
    const outHtml = `${body}${chosen.signature_html && html?.ok ? chosen.signature_html : ""}${footer}`;
    const outcome = await sendMail({
      from: senderAddress(chosen),
      to: contact.email,
      replyTo: chosen.reply_to,
      subject: subject.text,
      text: outText,
      html: outHtml,
      unsubscribeUrl: link,
      oneClickUrl: oneClickUnsubscribeUrl(baseUrl, e.organization_id, contact.id),
      idempotencyKey: key,
    });
    if (!outcome.ok) {
      if (outcome.retryable && e.attempts + 1 < MAX_ATTEMPTS) {
        await update(e, { attempts: e.attempts + 1, next_send_at: plus(now, RETRY_MS), error: outcome.message.slice(0, 500) });
        result.deferred++;
      } else {
        await fail(e, step, chosen.id, outcome.message);
      }
      continue;
    }
    instanceLeft--;
    mailboxSent.set(chosen.id, (mailboxSent.get(chosen.id) ?? 0) + 1);
    mailboxLast.set(chosen.id, Date.now());
    campaignSent.set(campaign.id, (campaignSent.get(campaign.id) ?? 0) + 1);
    const { error: insertError } = await admin.from("messages").insert({
      organization_id: e.organization_id,
      campaign_id: e.campaign_id,
      contact_id: e.contact_id,
      step_id: step.id,
      mailbox_id: chosen.id,
      status: "sent",
      idempotency_key: key,
      resend_id: outcome.id,
      subject: subject.text,
      sent_at: new Date().toISOString(),
    });
    if (insertError) console.error("messages insert failed after send", { enrollment: e.id, resend_id: outcome.id, message: insertError.message });
    await advance(e, steps, step, { attempts: 0, error: null, mailbox_id: chosen.id, last_sent_at: new Date().toISOString() });
    result.sent++;
  }
  return result;
}
