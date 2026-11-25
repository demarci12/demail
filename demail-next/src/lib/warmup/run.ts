import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mailEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { MailAuthError } from "@/lib/mail/credentials";
import { sendThrough } from "@/lib/mail/send";
import type { MailThread, OutgoingMail } from "@/lib/mail/types";
import { localDayStart } from "@/lib/send/schedule";
import { findThread, pickThread, render } from "./library";
import { findInRecipient, rescueFromSpam } from "./placement";
import { MIN_GAP_MS, dailyTarget, inWorkday, intoWorkday, type Band } from "./plan";
import { validateWarmupWording } from "./wording";
type Admin = SupabaseClient<Database>;
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
type Mailbox = Row<"mailboxes">;
type Job = Row<"warmup_jobs">;
type Thread = Row<"warmup_threads">;
export type WarmupTickResult = { claimed: number; started: number; replied: number; checked: number; skipped: number; failed: number };
type Result =
  | { kind: "done"; did?: "start" | "reply" | "check" }
  | { kind: "defer"; at: Date }
  | { kind: "skip"; reason: string }
  | { kind: "retry"; message: string }
  | { kind: "fail"; message: string };
type Ctx = { admin: Admin; mailboxes: Map<string, Mailbox | null>; bands: Map<string, { band: Band; changedAt: string | null }> };
const BUDGET_MS = 45_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 10 * 60_000;
const CHECK_RETRY_MS = 5 * 60_000;
const MAX_CHECKS = 5;
const RECENT_PARTNERS = 5;
const SEEN_WINDOW_MS = 60 * 86_400_000;
const PROVIDERS = ["google", "microsoft"];
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const after = (from: Date, ms: number) => new Date(from.getTime() + ms);
const skip = (reason: string): Result => ({ kind: "skip", reason });
function senderAddress(m: Mailbox) {
  const name = m.from_name.replace(/["<>\r\n]/g, "").trim();
  return name ? `${name} <${m.email}>` : m.email;
}
function firstName(m: Mailbox) {
  const keep = (s: string) => s.replace(/[^\p{L}'-]/gu, "");
  const named = keep(m.from_name.trim().split(/\s+/)[0] ?? "");
  const word = named || keep((m.email.split("@")[0] ?? "").split(/[._+-]/)[0] ?? "");
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "there";
}
// The recipient's own filter tag goes on the last line, only when they turned it on.
function withTag(text: string, recipient: Mailbox) {
  return recipient.warmup_filter_tag_enabled && recipient.warmup_filter_tag ? `${text}\n\n${recipient.warmup_filter_tag}` : text;
}
async function mailboxOf(ctx: Ctx, id: string, orgId: string): Promise<Mailbox | null> {
  if (ctx.mailboxes.has(id)) return ctx.mailboxes.get(id) ?? null;
  const { data } = await ctx.admin.from("mailboxes").select("*").eq("id", id).eq("organization_id", orgId).maybeSingle();
  ctx.mailboxes.set(id, data);
  return data;
}
async function bandOf(ctx: Ctx, id: string, orgId: string) {
  const known = ctx.bands.get(id);
  if (known) return known;
  const { data } = await ctx.admin.from("mailbox_health").select("band, band_changed_at").eq("mailbox_id", id).eq("organization_id", orgId).maybeSingle();
  const value = { band: (data?.band ?? "healthy") as Band, changedAt: data?.band_changed_at ?? null };
  ctx.bands.set(id, value);
  return value;
}
const eligible = (m: Mailbox) => m.status === "active" && m.warmup_enabled && PROVIDERS.includes(m.provider);
// Shared guards for 'start' and 'reply': enabled, band, workday, daily target and minimum gap. Null means go ahead.
async function guard(ctx: Ctx, m: Mailbox, now: Date, kind: "start" | "reply"): Promise<Result | null> {
  if (!eligible(m)) return skip("Warmup is off for this mailbox");
  const { band, changedAt } = await bandOf(ctx, m.id, m.organization_id);
  if (band === "paused") return skip("Mailbox is paused by its health band");
  if (!inWorkday(now, m)) {
    const next = intoWorkday(now, m);
    return next ? { kind: "defer", at: after(next, rand(0, 10 * 60_000)) } : skip("No workday configured");
  }
  const { count } = await ctx.admin
    .from("warmup_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_mailbox_id", m.id)
    .eq("organization_id", m.organization_id)
    .gte("sent_at", localDayStart(now, m.timezone).toISOString());
  if ((count ?? 0) >= dailyTarget(m.warmup_started_at, now, m.timezone, band, changedAt)) {
    if (kind === "start") return skip("Daily warmup target reached");
    const next = intoWorkday(after(localDayStart(now, m.timezone), 25 * 3_600_000), m);
    return next ? { kind: "defer", at: after(next, rand(0, 10 * 60_000)) } : skip("No workday configured");
  }
  const { data: last } = await ctx.admin
    .from("warmup_messages")
    .select("sent_at")
    .eq("sender_mailbox_id", m.id)
    .eq("organization_id", m.organization_id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && now.getTime() - new Date(last.sent_at).getTime() < MIN_GAP_MS) {
    return { kind: "defer", at: after(new Date(last.sent_at), MIN_GAP_MS + rand(0, 60_000)) };
  }
  return null;
}
function outcomeToResult(outcome: Extract<Awaited<ReturnType<typeof sendThrough>>, { ok: false }>): Result {
  return outcome.retryable ? { kind: "retry", message: outcome.message } : { kind: "fail", message: outcome.message };
}
async function scheduleCheck(ctx: Ctx, org: string, recipientId: string, messageId: string, threadId: string, now: Date) {
  const { error } = await ctx.admin.from("warmup_jobs").insert({
    organization_id: org,
    mailbox_id: recipientId,
    kind: "check",
    thread_id: threadId,
    message_id: messageId,
    run_at: after(now, rand(3 * 60_000, 6 * 60_000)).toISOString(),
  });
  return !error;
}
async function doStart(ctx: Ctx, job: Job, now: Date): Promise<Result> {
  const { admin } = ctx;
  const mb = await mailboxOf(ctx, job.mailbox_id, job.organization_id);
  if (!mb) return skip("Mailbox no longer exists");
  const blocked = await guard(ctx, mb, now, "start");
  if (blocked) return blocked;
  const { data: others } = await admin
    .from("mailboxes")
    .select("*")
    .eq("organization_id", mb.organization_id)
    .eq("warmup_enabled", true)
    .eq("status", "active")
    .in("provider", ["google", "microsoft"])
    .neq("id", mb.id);
  const candidates: Mailbox[] = [];
  for (const o of others ?? []) {
    ctx.mailboxes.set(o.id, o);
    if ((await bandOf(ctx, o.id, o.organization_id)).band !== "paused") candidates.push(o);
  }
  if (candidates.length === 0) return skip("No partner mailbox available");
  const { data: recent } = await admin
    .from("warmup_messages")
    .select("recipient_mailbox_id")
    .eq("sender_mailbox_id", mb.id)
    .eq("organization_id", mb.organization_id)
    .order("sent_at", { ascending: false })
    .limit(RECENT_PARTNERS);
  const avoid = new Set((recent ?? []).map((r) => r.recipient_mailbox_id));
  const fresh = candidates.filter((c) => !avoid.has(c.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  const partner = pool[Math.floor(Math.random() * pool.length)];
  const pair = `${mb.id},${partner.id}`;
  const { data: seen } = await admin
    .from("warmup_threads")
    .select("library_key, created_at")
    .eq("organization_id", mb.organization_id)
    .or(`initiator_mailbox_id.in.(${pair}),partner_mailbox_id.in.(${pair})`)
    .order("created_at", { ascending: false })
    .limit(500);
  const seenRecently = new Set<string>();
  const seenEver = new Map<string, number>();
  for (const t of seen ?? []) {
    const at = new Date(t.created_at).getTime();
    if (at > (seenEver.get(t.library_key) ?? 0)) seenEver.set(t.library_key, at);
    if (now.getTime() - at < SEEN_WINDOW_MS) seenRecently.add(t.library_key);
  }
  const picked = pickThread({ seenRecently, seenEver });
  if (!picked) return { kind: "fail", message: "The warmup library is empty" };
  const vars = { to_first: firstName(partner), from_first: firstName(mb) };
  const subject = render(picked.subject, vars);
  const text = withTag(render(picked.turns[0], vars), partner);
  if (!validateWarmupWording(subject).ok || !validateWarmupWording(text).ok) return { kind: "fail", message: "Content refused by the wording check" };
  const mail: OutgoingMail = { from: senderAddress(mb), to: partner.email, subject, text, unsubscribeUrl: "", oneClickUrl: "", idempotencyKey: job.id, plain: true };
  const outcome = await sendThrough(admin, mb, mail);
  if (!outcome.ok) return outcomeToResult(outcome);
  const threadId = randomUUID();
  const messageId = randomUUID();
  const { error: tErr } = await admin.from("warmup_threads").insert({
    id: threadId,
    organization_id: mb.organization_id,
    library_key: picked.key,
    initiator_mailbox_id: mb.id,
    partner_mailbox_id: partner.id,
    turns_total: picked.turns.length,
    turns_sent: 1,
    last_turn_at: now.toISOString(),
  });
  const { error: mErr } = tErr
    ? { error: tErr }
    : await admin.from("warmup_messages").insert({
        id: messageId,
        organization_id: mb.organization_id,
        thread_id: threadId,
        turn: 1,
        sender_mailbox_id: mb.id,
        recipient_mailbox_id: partner.id,
        rfc_message_id: outcome.rfcMessageId ?? null,
        provider_message_id: outcome.id,
        provider_thread_id: outcome.providerThreadId ?? null,
        subject,
        sent_at: now.toISOString(),
      });
  if (mErr || !(await scheduleCheck(ctx, mb.organization_id, partner.id, messageId, threadId, now))) {
    return { kind: "fail", message: "Sent, but the result could not be recorded" };
  }
  return { kind: "done", did: "start" };
}
async function closeThread(ctx: Ctx, thread: Thread) {
  await ctx.admin.from("warmup_threads").update({ status: "closed" }).eq("id", thread.id).eq("organization_id", thread.organization_id);
}
async function doReply(ctx: Ctx, job: Job, now: Date): Promise<Result> {
  const { admin } = ctx;
  if (!job.message_id) return skip("Reply job has no message");
  const mb = await mailboxOf(ctx, job.mailbox_id, job.organization_id);
  if (!mb) return skip("Mailbox no longer exists");
  const { data: prev } = await admin.from("warmup_messages").select("*").eq("id", job.message_id).eq("organization_id", job.organization_id).maybeSingle();
  if (!prev || prev.recipient_mailbox_id !== mb.id) return skip("Message to reply to is gone");
  const { data: thread } = await admin.from("warmup_threads").select("*").eq("id", prev.thread_id).eq("organization_id", job.organization_id).maybeSingle();
  if (!thread || thread.status !== "open") return skip("Thread is closed");
  const blocked = await guard(ctx, mb, now, "reply");
  if (blocked) return blocked;
  const partner = await mailboxOf(ctx, prev.sender_mailbox_id, job.organization_id);
  const entry = findThread(thread.library_key);
  if (!partner || !eligible(partner) || !entry || prev.turn >= entry.turns.length || !prev.rfc_message_id) {
    await closeThread(ctx, thread);
    return skip("Thread cannot continue");
  }
  if (mb.provider === "google" && !prev.recipient_provider_thread_id) return skip("Thread not located in the mailbox");
  const { data: earlier } = await admin.from("warmup_messages").select("rfc_message_id").eq("thread_id", thread.id).eq("organization_id", job.organization_id).order("turn");
  const references = (earlier ?? []).map((m) => m.rfc_message_id).filter((v): v is string => !!v);
  const vars = { to_first: firstName(partner), from_first: firstName(mb) };
  const subject = `Re: ${prev.subject.replace(/^(re:\s*)+/i, "")}`;
  const text = withTag(render(entry.turns[prev.turn], vars), partner);
  if (!validateWarmupWording(subject).ok || !validateWarmupWording(text).ok) return { kind: "fail", message: "Content refused by the wording check" };
  const threadRef: MailThread = { providerThreadId: prev.recipient_provider_thread_id ?? "", inReplyToRfcId: prev.rfc_message_id, references };
  const outcome = await sendThrough(admin, mb, {
    from: senderAddress(mb),
    to: partner.email,
    subject,
    text,
    unsubscribeUrl: "",
    oneClickUrl: "",
    idempotencyKey: job.id,
    thread: threadRef,
    plain: true,
  });
  if (!outcome.ok) return outcomeToResult(outcome);
  const messageId = randomUUID();
  const turn = prev.turn + 1;
  const { error: mErr } = await admin.from("warmup_messages").insert({
    id: messageId,
    organization_id: job.organization_id,
    thread_id: thread.id,
    turn,
    sender_mailbox_id: mb.id,
    recipient_mailbox_id: partner.id,
    rfc_message_id: outcome.rfcMessageId ?? null,
    provider_message_id: outcome.id,
    provider_thread_id: outcome.providerThreadId ?? null,
    subject,
    sent_at: now.toISOString(),
  });
  await admin
    .from("warmup_threads")
    .update({ turns_sent: turn, last_turn_at: now.toISOString(), status: turn >= thread.turns_total ? "closed" : "open" })
    .eq("id", thread.id)
    .eq("organization_id", job.organization_id);
  if (mErr || !(await scheduleCheck(ctx, job.organization_id, partner.id, messageId, thread.id, now))) {
    return { kind: "fail", message: "Sent, but the result could not be recorded" };
  }
  return { kind: "done", did: "reply" };
}
async function doCheck(ctx: Ctx, job: Job, now: Date): Promise<Result> {
  const { admin } = ctx;
  if (!job.message_id) return skip("Check job has no message");
  const recipient = await mailboxOf(ctx, job.mailbox_id, job.organization_id);
  const { data: msg } = await admin.from("warmup_messages").select("*").eq("id", job.message_id).eq("organization_id", job.organization_id).maybeSingle();
  if (!recipient || !msg || msg.recipient_mailbox_id !== recipient.id) return skip("Message or mailbox is gone");
  if (recipient.status === "disconnected") return skip("Mailbox needs reconnecting");
  const patch = (values: Database["public"]["Tables"]["warmup_messages"]["Update"]) =>
    admin.from("warmup_messages").update(values).eq("id", msg.id).eq("organization_id", msg.organization_id);
  const { data: thread } = await admin.from("warmup_threads").select("*").eq("id", msg.thread_id).eq("organization_id", msg.organization_id).maybeSingle();
  const found = msg.rfc_message_id ? await findInRecipient(admin, recipient, msg.rfc_message_id) : null;
  if (!found) {
    const attempts = msg.check_attempts + 1;
    if (msg.rfc_message_id && attempts < MAX_CHECKS) {
      await patch({ check_attempts: attempts });
      return { kind: "defer", at: after(now, CHECK_RETRY_MS) };
    }
    await patch({ check_attempts: attempts, placement: "missing", placement_checked_at: now.toISOString() });
    if (thread) await closeThread(ctx, thread);
    return { kind: "done", did: "check" };
  }
  await patch({
    placement: found.placement,
    placement_checked_at: now.toISOString(),
    check_attempts: msg.check_attempts + 1,
    recipient_provider_message_id: found.providerMessageId,
    recipient_provider_thread_id: found.providerThreadId,
  });
  if (found.placement === "spam" && recipient.provider === "microsoft") {
    try {
      const moved = await rescueFromSpam(admin, recipient, found.providerMessageId);
      if (moved) await patch({ rescued: true, recipient_provider_message_id: moved });
    } catch (e) {
      if (e instanceof MailAuthError) throw e;
    }
  }
  if (!thread || thread.status !== "open") return { kind: "done", did: "check" };
  const { count } = await admin.from("warmup_jobs").select("id", { count: "exact", head: true }).eq("organization_id", msg.organization_id).eq("kind", "reply").eq("message_id", msg.id);
  const turnsLeft = thread.turns_sent < thread.turns_total;
  const chance = msg.turn === 1 ? 0.7 : 0.5;
  if ((count ?? 0) === 0 && turnsLeft && found.placement !== "other" && Math.random() < chance) {
    const at = after(now, rand(45 * 60_000, 5 * 3_600_000));
    await admin.from("warmup_jobs").insert({
      organization_id: msg.organization_id,
      mailbox_id: recipient.id,
      kind: "reply",
      thread_id: thread.id,
      message_id: msg.id,
      run_at: (intoWorkday(at, recipient) ?? at).toISOString(),
    });
  } else if ((count ?? 0) === 0) {
    await closeThread(ctx, thread);
  }
  return { kind: "done", did: "check" };
}
async function finish(admin: Admin, job: Job, r: Result, now: Date) {
  const where = (values: Database["public"]["Tables"]["warmup_jobs"]["Update"]) => admin.from("warmup_jobs").update(values).eq("id", job.id).eq("organization_id", job.organization_id);
  if (r.kind === "done") return where({ status: "done", error: null });
  if (r.kind === "defer") return where({ status: "pending", run_at: r.at.toISOString() });
  if (r.kind === "skip") return where({ status: "skipped", error: r.reason });
  if (r.kind === "fail") return where({ status: "failed", error: r.message.slice(0, 300) });
  const attempts = job.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) return where({ status: "failed", attempts, error: r.message.slice(0, 300) });
  return where({ status: "pending", attempts, run_at: after(now, BACKOFF_MS).toISOString(), error: r.message.slice(0, 300) });
}
// Claims due jobs and runs them one by one; the unfinished rest is released when the time budget ends.
export async function runWarmupTick(now = new Date()): Promise<WarmupTickResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_due_warmup_jobs", { batch: mailEnv().WARMUP_BATCH_SIZE });
  if (error) throw new Error("Could not claim warmup jobs");
  const jobs = data ?? [];
  const ctx: Ctx = { admin, mailboxes: new Map(), bands: new Map() };
  const out: WarmupTickResult = { claimed: jobs.length, started: 0, replied: 0, checked: 0, skipped: 0, failed: 0 };
  const began = Date.now();
  for (let i = 0; i < jobs.length; i++) {
    if (Date.now() - began > BUDGET_MS) {
      const rest = jobs.slice(i).map((j) => j.id);
      await admin.from("warmup_jobs").update({ run_at: new Date().toISOString() }).in("id", rest);
      break;
    }
    const job = jobs[i];
    const at = after(now, Date.now() - began);
    let result: Result;
    try {
      result = job.kind === "start" ? await doStart(ctx, job, at) : job.kind === "reply" ? await doReply(ctx, job, at) : await doCheck(ctx, job, at);
    } catch (e) {
      if (e instanceof MailAuthError) {
        await admin.from("mailboxes").update({ status: "disconnected", last_error: "Reconnect this mailbox" }).eq("id", job.mailbox_id).eq("organization_id", job.organization_id);
        ctx.mailboxes.delete(job.mailbox_id);
        result = skip("Mailbox needs reconnecting");
      } else {
        result = { kind: "retry", message: e instanceof Error ? e.name : "Unexpected error" };
      }
    }
    await finish(admin, job, result, at);
    if (result.kind === "done") {
      if (result.did === "start") out.started++;
      else if (result.did === "reply") out.replied++;
      else out.checked++;
    } else if (result.kind === "skip") out.skipped++;
    else if (result.kind === "fail" || (result.kind === "retry" && job.attempts + 1 >= MAX_ATTEMPTS)) out.failed++;
  }
  return out;
}
