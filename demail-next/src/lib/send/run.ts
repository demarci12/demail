import "server-only";
import { serverEnv, publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { contactData, escapeHtml, renderTemplate } from "@/lib/merge";
import { randomUUID } from "node:crypto";
import { linkifyPlain, pixelTag, rewriteLinks } from "@/lib/tracking/rewrite";
import { clickUrl, openUrl } from "@/lib/tracking/token";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "@/lib/unsubscribe";
import { MailAuthError } from "@/lib/mail/credentials";
import { sendThrough } from "@/lib/mail/send";
import type { MailThread } from "@/lib/mail/types";
import { localDayStart, nextWindowStart } from "./schedule";
import { chooseVariant } from "./variants";
import { branchTarget } from "./branch";
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
type Campaign = Row<"campaigns">;
type Step = Row<"campaign_steps">;
type Mailbox = Row<"mailboxes">;
type Enrollment = Row<"campaign_contacts">;
type Variant = Row<"campaign_step_variants">;
export type TickResult = { claimed: number; sent: number; waited: number; deferred: number; stopped: number; failed: number; completed: number; branched: number };
const MAX_ATTEMPTS = 5;
const RETRY_MS = 5 * 60_000;
const DEFER_MS = 15 * 60_000;
const POOL_DEFER_MS = 60 * 60_000;
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
function htmlFromPlain(text: string, wrap: ((url: string) => string) | null) {
  return linkifyPlain(text, wrap);
}
// One scheduler tick: claims a bounded batch of due enrollments and advances each by one step.
export async function runSendTick(now = new Date()): Promise<TickResult> {
  const env = serverEnv();
  const baseUrl = publicEnv().NEXT_PUBLIC_APP_URL;
  const admin = createAdminClient();
  const result: TickResult = { claimed: 0, sent: 0, waited: 0, deferred: 0, stopped: 0, failed: 0, completed: 0, branched: 0 };
  let { data: claimed, error } = await admin.rpc("claim_send_batch", { batch: env.SEND_BATCH_SIZE });
  // Before migration 003300 only the old claim exists.
  if (error?.code === "PGRST202") ({ data: claimed, error } = await admin.rpc("claim_due_enrollments", { batch: env.SEND_BATCH_SIZE }));
  if (error) throw new Error(`claim_due_enrollments failed: ${error.message}`);
  const rows = claimed ?? [];
  result.claimed = rows.length;
  if (rows.length === 0) return result;
  const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { count: sentToday } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("status", "sent").not("resend_id", "is", null).gte("sent_at", utcStart.toISOString());
  let instanceLeft = env.INSTANCE_DAILY_SEND_CAP - (sentToday ?? 0);
  const campaigns = new Map<string, { campaign: Campaign; steps: Step[]; mailboxes: Mailbox[]; variants: Map<string, Variant[]> } | null>();
  const mailboxSent = new Map<string, number>();
  const mailboxLast = new Map<string, number>();
  const campaignSent = new Map<string, number>();
  const poolState = new Map<string, { agency: string; capLeft: number | null } | null>();
  const agencyPoolLeft = new Map<string, number | null>();
  // A mailbox with no row counts as healthy.
  const bands = new Map<string, string>();
  {
    const { data: health } = await admin.from("mailbox_health").select("mailbox_id, band");
    for (const h of health ?? []) bands.set(h.mailbox_id, h.band);
  }
  // Domains paused by a blocklist listing (opt-in per workspace). A read error leaves sending as it was.
  const listedDomains = new Set<string>();
  {
    const { data: pauses } = await admin.from("dnsbl_pauses").select("organization_id, domain").eq("active", true);
    for (const p of pauses ?? []) listedDomains.add(`${p.organization_id}|${p.domain}`);
  }
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
      const stepIds = (steps ?? []).map((s) => s.id);
      const { data: variantRows } = stepIds.length
        ? await admin.from("campaign_step_variants").select("*").in("step_id", stepIds).eq("active", true).order("label")
        : { data: [] as Variant[] };
      const variants = new Map<string, Variant[]>();
      for (const v of variantRows ?? []) variants.set(v.step_id, [...(variants.get(v.step_id) ?? []), v]);
      entry = { campaign, steps: steps ?? [], mailboxes: boxes ?? [], variants };
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
  // Agency send pool and client cap, read once per workspace per tick; overlapping ticks can overshoot by one batch.
  async function poolHeld(orgId: string) {
    if (!poolState.has(orgId)) {
      const { data, error } = await admin.rpc("send_pool_state", { p_org: orgId });
      if (error) {
        console.error("send_pool_state failed", { organization: orgId });
        return true;
      }
      const row = data?.[0];
      if (row) {
        if (!agencyPoolLeft.has(row.agency_id)) agencyPoolLeft.set(row.agency_id, row.pool_left);
        poolState.set(orgId, { agency: row.agency_id, capLeft: row.cap_left });
      } else poolState.set(orgId, null);
    }
    const st = poolState.get(orgId);
    if (!st) return false;
    const left = agencyPoolLeft.get(st.agency);
    return (typeof left === "number" && left <= 0) || (st.capLeft !== null && st.capLeft <= 0);
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
  // Gives the unibox our side of the conversation and lets replies match by thread id.
  async function recordOutbound(m: Mailbox, e: Enrollment, to: string, subject: string, body: string, messageId: string, threadId: string, rfcId: string | null) {
    const sentAt = new Date().toISOString();
    const { data: existing } = await admin.from("threads").select("id").eq("mailbox_id", m.id).eq("organization_id", m.organization_id).eq("provider_thread_id", threadId).maybeSingle();
    let id = existing?.id;
    if (id) {
      await admin.from("threads").update({ last_message_at: sentAt }).eq("id", id).eq("organization_id", m.organization_id);
    } else {
      const { data: created } = await admin
        .from("threads")
        .insert({
          organization_id: m.organization_id,
          mailbox_id: m.id,
          provider_thread_id: threadId,
          subject,
          contact_id: e.contact_id,
          campaign_id: e.campaign_id,
          snippet: body.replace(/\s+/g, " ").trim().slice(0, 200),
          last_message_at: sentAt,
          is_unread: false,
        })
        .select("id")
        .single();
      id = created?.id;
    }
    if (!id) {
      console.error("thread insert failed after send", { enrollment: e.id });
      return;
    }
    const { error } = await admin.from("thread_messages").insert({
      organization_id: m.organization_id,
      thread_id: id,
      direction: "out",
      kind: "sent",
      provider_message_id: messageId,
      rfc_message_id: rfcId,
      from_email: m.email,
      from_name: m.from_name,
      to_emails: [to],
      subject,
      body_text: body,
      sent_at: sentAt,
    });
    if (error && error.code !== "23505") console.error("thread message insert failed after send", { enrollment: e.id, message: error.message });
  }
  for (const e of rows) {
    const entry = await loadCampaign(e.campaign_id);
    if (!entry) {
      await update(e, { status: "stopped", next_send_at: null, error: "Campaign not found" });
      result.stopped++;
      continue;
    }
    const { campaign, steps, mailboxes, variants } = entry;
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
    if (contact.verify_status === "invalid") {
      await logMessage(e, step, null, "skipped", { error: "Invalid email address" });
      await update(e, { status: "stopped", next_send_at: null, error: "Invalid email address" });
      result.stopped++;
      continue;
    }
    if (!step) {
      await update(e, { status: "completed", next_send_at: null });
      result.completed++;
      continue;
    }
    // A condition is decided once and stored, so a retry takes the same path; nothing is sent.
    if (step.type === "branch") {
      const { data: outcome, error: decideError } = await admin.rpc("decide_branch", { p_enrollment: e.id, p_step: step.id });
      if (decideError || typeof outcome !== "boolean") {
        console.error("decide_branch failed", { enrollment: e.id });
        await defer(e, plus(now, DEFER_MS));
        continue;
      }
      const target = branchTarget(steps, step, outcome);
      if (target) await update(e, { current_step: target.position, next_send_at: new Date().toISOString(), attempts: 0 });
      else {
        await update(e, { status: "completed", next_send_at: null, current_step: step.position + 1 });
        result.completed++;
      }
      result.branched++;
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
    if (campaign.daily_limit !== null && (await campaignSentToday(campaign)) >= campaign.daily_limit) {
      await defer(e, plus(now, DEFER_MS));
      continue;
    }
    if (await poolHeld(e.organization_id)) {
      await defer(e, plus(now, POOL_DEFER_MS));
      continue;
    }
    // Keep the enrollment on its mailbox while it is usable, otherwise pick the least used one.
    // A follow-up from a Gmail or Microsoft mailbox stays on that mailbox and thread.
    const { data: sentRows } = await admin
      .from("messages")
      .select("mailbox_id, subject, provider_thread_id, rfc_message_id")
      .eq("organization_id", e.organization_id)
      .eq("campaign_id", e.campaign_id)
      .eq("contact_id", e.contact_id)
      .eq("status", "sent")
      .not("provider_thread_id", "is", null)
      .order("sent_at", { ascending: true });
    const history = sentRows ?? [];
    const first = history[0];
    const last = history[history.length - 1];
    let thread: MailThread | undefined;
    let threadSubject: string | null = null;
    let pinnedTo: string | null = null;
    if (first && last?.mailbox_id) {
      pinnedTo = last.mailbox_id;
      thread = {
        providerThreadId: last.provider_thread_id!,
        inReplyToRfcId: last.rfc_message_id,
        references: history.map((h) => h.rfc_message_id).filter((id): id is string => !!id),
      };
      threadSubject = `Re: ${(first.subject ?? "").replace(/^(re:\s*)+/i, "")}`;
    }
    const ordered = [...mailboxes].sort((a, b) => (a.id === e.mailbox_id ? -1 : b.id === e.mailbox_id ? 1 : 0));
    let chosen: Mailbox | null = null;
    let retryAt = now.getTime() + DEFER_MS;
    const eligible: { m: Mailbox; sent: number }[] = [];
    let gapBlocked = false;
    let instanceBlocked = false;
    let healthBlocked = false;
    for (const m of pinnedTo ? ordered.filter((x) => x.id === pinnedTo) : ordered) {
      // The instance cap covers Resend only.
      if (m.provider === "resend" && instanceLeft <= 0) {
        instanceBlocked = true;
        continue;
      }
      const band = bands.get(m.id) ?? "healthy";
      if (band === "paused" || listedDomains.has(`${m.organization_id}|${m.email.split("@")[1]?.toLowerCase()}`)) {
        retryAt = Math.min(retryAt, now.getTime() + DEFER_MS);
        healthBlocked = true;
        continue;
      }
      const throttled = band === "throttled";
      const limit = throttled ? Math.max(1, Math.floor(m.daily_limit / 2)) : m.daily_limit;
      const st = await mailboxState(m);
      const gapEnds = st.last + m.min_gap_seconds * (throttled ? 2 : 1) * 1000;
      if (st.sent >= limit) {
        if (pinnedTo) retryAt = new Date(nextUtcMidnight(now)).getTime();
        continue;
      }
      if (gapEnds > now.getTime()) {
        retryAt = Math.min(retryAt, gapEnds);
        gapBlocked = true;
        continue;
      }
      eligible.push({ m, sent: st.sent });
    }
    if (eligible.length) {
      const pinned = eligible.find((x) => x.m.id === e.mailbox_id);
      chosen = (pinned ?? eligible.sort((a, b) => a.sent - b.sent)[0]).m;
    }
    if (!chosen) {
      if (instanceBlocked && !gapBlocked && !healthBlocked && !pinnedTo) {
        await defer(e, nextUtcMidnight(now));
        continue;
      }
      await defer(e, new Date(Math.max(retryAt, now.getTime() + 1000)).toISOString());
      continue;
    }
    const data = contactData(contact);
    const variant = chooseVariant(e.id, step, variants.get(step.id) ?? []);
    const subject = renderTemplate(variant?.subject ?? step.subject ?? "", data);
    const text = renderTemplate(variant?.body_plain ?? step.body_plain ?? "", data);
    // Variants are plain text, so only variant A uses the step's HTML body.
    const html = !variant && step.body_html ? renderTemplate(step.body_html, data, escapeHtml) : null;
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
    const messageId = randomUUID();
    const wrap = campaign.track_clicks ? (url: string) => clickUrl(messageId, url) : null;
    const rendered = html?.ok ? (wrap ? rewriteLinks(html.text, wrap) : html.text) : htmlFromPlain(text.text + sigPlain, wrap);
    const signature = chosen.signature_html && html?.ok ? (wrap ? rewriteLinks(chosen.signature_html, wrap) : chosen.signature_html) : "";
    const pixel = campaign.track_opens ? pixelTag(openUrl(messageId)) : "";
    const outHtml = `${rendered}${signature}${footer}${pixel}`;
    // A reply may have stopped the enrollment while it was leased.
    const { data: current } = await admin.from("campaign_contacts").select("status").eq("id", e.id).eq("organization_id", e.organization_id).maybeSingle();
    if (!current || current.status !== "active") {
      result.stopped++;
      continue;
    }
    let outcome: Awaited<ReturnType<typeof sendThrough>>;
    try {
      outcome = await sendThrough(admin, chosen, {
      from: senderAddress(chosen),
      to: contact.email,
      replyTo: chosen.reply_to,
      subject: thread && threadSubject ? threadSubject : subject.text,
      text: outText,
      html: outHtml,
      unsubscribeUrl: link,
      oneClickUrl: oneClickUnsubscribeUrl(baseUrl, e.organization_id, contact.id),
      idempotencyKey: key,
      thread,
      });
    } catch (err) {
      if (!(err instanceof MailAuthError)) throw err;
      // The mailbox needs reconnecting: drop it from every cached campaign and retry later without counting an attempt.
      await admin.from("mailboxes").update({ status: "disconnected", last_error: "Reconnect this mailbox" }).eq("id", chosen.id).eq("organization_id", chosen.organization_id);
      for (const c of campaigns.values()) if (c) c.mailboxes = c.mailboxes.filter((x) => x.id !== chosen.id);
      await defer(e, plus(now, DEFER_MS));
      continue;
    }
    if (!outcome.ok) {
      if (outcome.retryable && e.attempts + 1 < MAX_ATTEMPTS) {
        await update(e, { attempts: e.attempts + 1, next_send_at: plus(now, outcome.retryAfterMs ?? RETRY_MS), error: outcome.message.slice(0, 500) });
        result.deferred++;
      } else {
        await fail(e, step, chosen.id, outcome.message);
      }
      continue;
    }
    if (chosen.provider === "resend") instanceLeft--;
    mailboxSent.set(chosen.id, (mailboxSent.get(chosen.id) ?? 0) + 1);
    mailboxLast.set(chosen.id, Date.now());
    campaignSent.set(campaign.id, (campaignSent.get(campaign.id) ?? 0) + 1);
    const pool = poolState.get(e.organization_id);
    if (pool) {
      const left = agencyPoolLeft.get(pool.agency);
      if (typeof left === "number") agencyPoolLeft.set(pool.agency, left - 1);
      if (typeof pool.capLeft === "number") pool.capLeft--;
    }
    const { error: insertError } = await admin.from("messages").insert({
      id: messageId,
      organization_id: e.organization_id,
      campaign_id: e.campaign_id,
      contact_id: e.contact_id,
      step_id: step.id,
      mailbox_id: chosen.id,
      status: "sent",
      idempotency_key: key,
      resend_id: chosen.provider === "resend" ? outcome.id : null,
      provider_message_id: chosen.provider === "resend" ? null : outcome.id,
      provider_thread_id: outcome.providerThreadId ?? null,
      rfc_message_id: outcome.rfcMessageId ?? null,
      subject: thread && threadSubject ? threadSubject : subject.text,
      sent_at: new Date().toISOString(),
      variant_id: variant?.id ?? null,
    });
    if (insertError) console.error("messages insert failed after send", { enrollment: e.id, message_id: outcome.id, message: insertError.message });
    if (chosen.provider !== "resend" && outcome.providerThreadId) {
      await recordOutbound(chosen, e, contact.email, thread && threadSubject ? threadSubject : subject.text, text.text, outcome.id, outcome.providerThreadId, outcome.rfcMessageId ?? null);
    }
    await advance(e, steps, step, { attempts: 0, error: null, mailbox_id: chosen.id, last_sent_at: new Date().toISOString() });
    result.sent++;
  }
  return result;
}
