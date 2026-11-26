"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { publicEnv } from "@/lib/env";
import { MERGE_FIELDS, SAMPLE_CONTACT, contactData, renderTemplate } from "@/lib/merge";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendStepTest } from "@/lib/send/test-send";
import { aiCall, aiErrorMessage } from "@/lib/ai/run";
import { stepDraftMessages } from "@/lib/ai/prompts";
import { parseStepDraft } from "@/lib/ai/shared";
const uuid = z.string().uuid();
function back(id: string, key: "error" | "msg", message: string): never {
  return redirect(`/app/campaigns/${id}?${key}=${encodeURIComponent(message)}`);
}
const settingsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    timezone: z.string().trim().min(1).max(64),
    send_days: z.number().int().min(0).max(127),
    send_start: z.string().regex(/^\d{2}:\d{2}$/),
    send_end: z.string().regex(/^\d{2}:\d{2}$/),
    track_opens: z.boolean(),
    track_clicks: z.boolean(),
  })
  .refine((v) => v.send_end > v.send_start, "end")
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: v.timezone });
      return true;
    } catch {
      return false;
    }
  }, "timezone");
function settings(formData: FormData) {
  const send_days = formData.getAll("day").reduce<number>((mask, v) => mask | (1 << Number(v)), 0);
  return settingsSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    send_days,
    send_start: formData.get("send_start"),
    send_end: formData.get("send_end"),
    track_opens: formData.get("track_opens") === "on",
    track_clicks: formData.get("track_clicks") === "on",
  });
}
export async function createCampaign(formData: FormData) {
  const { supabase, org } = await getOrgContext();
  const parsed = settings(formData);
  if (!parsed.success) redirect("/app/campaigns/new?error=" + encodeURIComponent("Check the name, timezone and send window."));
  const { data, error } = await supabase.from("campaigns").insert({ ...parsed.data, organization_id: org.id }).select("id").single();
  if (error || !data) redirect("/app/campaigns/new?error=" + encodeURIComponent("Could not create the campaign."));
  revalidatePath("/app/campaigns");
  redirect(`/app/campaigns/${data.id}`);
}
async function editableCampaign(id: string) {
  const ctx = await getOrgContext();
  if (!uuid.safeParse(id).success) redirect("/app/campaigns");
  const { data } = await ctx.supabase.from("campaigns").select("id, status").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!data) redirect("/app/campaigns");
  return { ...ctx, campaign: data };
}
export async function updateCampaign(id: string, formData: FormData) {
  const { supabase, org } = await editableCampaign(id);
  const parsed = settings(formData);
  if (!parsed.success) back(id, "error", "Check the name, timezone and send window.");
  await supabase.from("campaigns").update(parsed.data!).eq("id", id).eq("organization_id", org.id);
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Settings saved.");
}
export async function saveSenders(id: string, formData: FormData) {
  const { supabase, org } = await editableCampaign(id);
  const ids = formData.getAll("mailbox").map(String).filter((v) => uuid.safeParse(v).success);
  await supabase.from("campaign_mailboxes").delete().eq("campaign_id", id).eq("organization_id", org.id);
  if (ids.length) {
    // Composite foreign keys reject a mailbox from another organization.
    const { error } = await supabase.from("campaign_mailboxes").insert(ids.map((mailbox_id) => ({ campaign_id: id, mailbox_id, organization_id: org.id })));
    if (error) back(id, "error", "Could not save the senders.");
  }
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Senders saved.");
}
export async function launchCampaign(id: string) {
  const { supabase, org } = await editableCampaign(id);
  const [{ count: emailSteps }, { count: senders }] = await Promise.all([
    supabase.from("campaign_steps").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("organization_id", org.id).eq("type", "email"),
    supabase.from("campaign_mailboxes").select("mailbox_id", { count: "exact", head: true }).eq("campaign_id", id).eq("organization_id", org.id),
  ]);
  if (!emailSteps) back(id, "error", "Add at least one email step before launching.");
  if (!senders) back(id, "error", "Select at least one sender before launching.");
  await supabase.from("campaigns").update({ status: "active" }).eq("id", id).eq("organization_id", org.id);
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Campaign is active.");
}
export async function pauseCampaign(id: string) {
  const { supabase, org } = await editableCampaign(id);
  await supabase.from("campaigns").update({ status: "paused" }).eq("id", id).eq("organization_id", org.id);
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Campaign paused.");
}
const stepSchema = z.object({
  name: z.string().trim().max(200).optional().transform((v) => v || null),
  subject: z.string().trim().max(500).optional(),
  body_plain: z.string().max(20000).optional(),
  amount: z.coerce.number().int().min(1).max(365).optional(),
  unit: z.enum(["minutes", "hours", "days"]).optional(),
});
const UNIT_SECONDS = { minutes: 60, hours: 3600, days: 86400 } as const;
function stepFields(type: "email" | "wait", formData: FormData) {
  const p = stepSchema.safeParse({
    name: formData.get("name") ?? undefined,
    subject: formData.get("subject") ?? undefined,
    body_plain: formData.get("body_plain") ?? undefined,
    amount: formData.get("amount") ?? undefined,
    unit: formData.get("unit") ?? undefined,
  });
  if (!p.success) return null;
  if (type === "email") {
    if (!p.data.subject?.trim() || !p.data.body_plain?.trim()) return null;
    return { type, name: p.data.name, subject: p.data.subject, body_plain: p.data.body_plain, wait_seconds: null };
  }
  if (!p.data.amount || !p.data.unit) return null;
  return { type, name: p.data.name, subject: null, body_plain: null, wait_seconds: p.data.amount * UNIT_SECONDS[p.data.unit] };
}
// Positions shift under in-flight enrollments, so steps only change while the campaign is not sending.
async function stepsEditable(id: string) {
  const ctx = await editableCampaign(id);
  if (ctx.campaign.status === "active") back(id, "error", "Pause the campaign before changing steps.");
  return ctx;
}
type OrgSupabase = Awaited<ReturnType<typeof getOrgContext>>["supabase"];
async function insertStep(supabase: OrgSupabase, orgId: string, id: string, fields: NonNullable<ReturnType<typeof stepFields>>) {
  const { data: last } = await supabase.from("campaign_steps").select("position").eq("campaign_id", id).eq("organization_id", orgId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("campaign_steps").insert({ ...fields, campaign_id: id, organization_id: orgId, position: (last?.position ?? -1) + 1 });
  return error;
}
export async function addStep(id: string, type: "email" | "wait", formData: FormData) {
  const { supabase, org } = await stepsEditable(id);
  const fields = stepFields(type, formData);
  if (!fields) back(id, "error", type === "email" ? "An email step needs a subject and a body." : "A wait step needs an amount and a unit.");
  const error = await insertStep(supabase, org.id, id, fields!);
  if (error) back(id, "error", "Could not add the step.");
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Step added.");
}
const draftSchema = z.object({
  brief: z.string().trim().min(10).max(2000),
  tone: z.enum(["friendly", "direct", "formal"]),
  position: z.enum(["first", "follow_up"]),
});
// One AI call per click; the draft is stored for review and never sent or added on its own.
export async function draftStepWithAi(id: string, formData: FormData) {
  const { org, user } = await stepsEditable(id);
  const parsed = draftSchema.safeParse({ brief: formData.get("brief"), tone: formData.get("tone"), position: formData.get("position") });
  if (!parsed.success) back(id, "error", "Write a brief of 10 to 2000 characters and pick a tone and position.");
  const { brief, tone, position } = parsed.data!;
  const admin = createAdminClient();
  let text: string;
  try {
    text = await aiCall(admin, org.id, stepDraftMessages({ workspace: org.name, brief, tone, position, mergeFields: [...MERGE_FIELDS] }), { maxTokens: 700, temperature: 0.7 });
  } catch (e) {
    return back(id, "error", aiErrorMessage(e));
  }
  const draft = parseStepDraft(text);
  if (!draft) back(id, "error", "The AI draft could not be read. Try again.");
  const { error } = await admin.from("ai_drafts").insert({ organization_id: org.id, kind: "step", campaign_id: id, brief, subject: draft!.subject, body: draft!.body, created_by: user.id });
  if (error) back(id, "error", "Could not save the AI draft.");
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "AI draft ready. Review it below before adding it.");
}
export async function applyAiDraftAsStep(id: string, draftId: string, formData: FormData) {
  const { supabase, org, user } = await stepsEditable(id);
  if (!uuid.safeParse(draftId).success) back(id, "error", "AI draft not found.");
  const fields = stepFields("email", formData);
  if (!fields) back(id, "error", "An email step needs a subject and a body.");
  const admin = createAdminClient();
  // Claim the draft before inserting, so a double submit adds one step.
  const { data: claimed } = await admin
    .from("ai_drafts")
    .update({ status: "used", approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("organization_id", org.id)
    .eq("campaign_id", id)
    .eq("kind", "step")
    .eq("status", "draft")
    .select("id");
  if (!claimed || claimed.length === 0) back(id, "error", "AI draft not found.");
  const error = await insertStep(supabase, org.id, id, fields!);
  if (error) {
    await admin.from("ai_drafts").update({ status: "draft", approved_by: null, approved_at: null }).eq("id", draftId).eq("organization_id", org.id).eq("status", "used");
    back(id, "error", "Could not add the step.");
  }
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Step added from the AI draft.");
}
export async function discardAiDraft(id: string, draftId: string) {
  const { org } = await editableCampaign(id);
  if (!uuid.safeParse(draftId).success) back(id, "error", "AI draft not found.");
  await createAdminClient().from("ai_drafts").update({ status: "discarded" }).eq("id", draftId).eq("organization_id", org.id).eq("campaign_id", id).eq("status", "draft");
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "AI draft discarded.");
}
export async function updateStep(id: string, stepId: string, type: "email" | "wait", formData: FormData) {
  const { supabase, org } = await stepsEditable(id);
  const fields = stepFields(type, formData);
  if (!fields || !uuid.safeParse(stepId).success) back(id, "error", "Check the step fields.");
  const { error } = await supabase.from("campaign_steps").update(fields!).eq("id", stepId).eq("campaign_id", id).eq("organization_id", org.id);
  if (error) back(id, "error", "Could not save the step.");
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Step saved.");
}
export async function deleteStep(id: string, stepId: string) {
  const { supabase, org } = await stepsEditable(id);
  const { data: steps } = await supabase.from("campaign_steps").select("id, position").eq("campaign_id", id).eq("organization_id", org.id).order("position");
  const rest = (steps ?? []).filter((s) => s.id !== stepId);
  await supabase.from("campaign_steps").delete().eq("id", stepId).eq("campaign_id", id).eq("organization_id", org.id);
  // Close the gap in ascending order so each update lands on a free position.
  for (const [i, s] of rest.entries()) if (s.position !== i) await supabase.from("campaign_steps").update({ position: i }).eq("id", s.id).eq("organization_id", org.id);
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Step deleted.");
}
export async function moveStep(id: string, stepId: string, direction: "up" | "down") {
  const { supabase, org } = await stepsEditable(id);
  const { data: steps } = await supabase.from("campaign_steps").select("id, position").eq("campaign_id", id).eq("organization_id", org.id).order("position");
  const list = steps ?? [];
  const i = list.findIndex((s) => s.id === stepId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) back(id, "msg", "Nothing to move.");
  const a = list[i];
  const b = list[j];
  // Three updates through a free position, because the unique check runs per statement.
  const temp = list.length + 1000;
  await supabase.from("campaign_steps").update({ position: temp }).eq("id", a.id).eq("organization_id", org.id);
  await supabase.from("campaign_steps").update({ position: a.position }).eq("id", b.id).eq("organization_id", org.id);
  await supabase.from("campaign_steps").update({ position: b.position }).eq("id", a.id).eq("organization_id", org.id);
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Step moved.");
}
const variantSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body_plain: z.string().max(20000).refine((v) => v.trim().length > 0),
});
const LABELS = "BCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
function variantFields(formData: FormData) {
  const p = variantSchema.safeParse({ subject: formData.get("subject") ?? undefined, body_plain: formData.get("body_plain") ?? undefined });
  return p.success ? p.data : null;
}
// Loads a variant only when its step belongs to this campaign and organization.
async function campaignVariant(supabase: Awaited<ReturnType<typeof getOrgContext>>["supabase"], orgId: string, id: string, variantId: string) {
  if (!uuid.safeParse(variantId).success) return null;
  const { data: variant } = await supabase.from("campaign_step_variants").select("id, step_id").eq("id", variantId).eq("organization_id", orgId).maybeSingle();
  if (!variant) return null;
  const { data: step } = await supabase.from("campaign_steps").select("id").eq("id", variant.step_id).eq("campaign_id", id).eq("organization_id", orgId).maybeSingle();
  return step ? variant : null;
}
export async function addVariant(id: string, stepId: string, formData: FormData) {
  const { supabase, org } = await stepsEditable(id);
  const fields = variantFields(formData);
  if (!fields || !uuid.safeParse(stepId).success) back(id, "error", "A variant needs a subject and a body.");
  const { data: step } = await supabase.from("campaign_steps").select("id, type").eq("id", stepId).eq("campaign_id", id).eq("organization_id", org.id).maybeSingle();
  if (!step || step.type !== "email") back(id, "error", "Variants belong to email steps.");
  const { data: existing } = await supabase.from("campaign_step_variants").select("label").eq("step_id", stepId).eq("organization_id", org.id);
  const used = new Set((existing ?? []).map((v) => v.label));
  const label = LABELS.find((l) => !used.has(l));
  if (!label) back(id, "error", "A step can have at most 25 variants.");
  const { error } = await supabase.from("campaign_step_variants").insert({ ...fields!, step_id: stepId, organization_id: org.id, label: label! });
  if (error) back(id, "error", "Could not add the variant.");
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", `Variant ${label} added.`);
}
export async function updateVariant(id: string, variantId: string, formData: FormData) {
  const { supabase, org } = await stepsEditable(id);
  const fields = variantFields(formData);
  if (!fields) back(id, "error", "A variant needs a subject and a body.");
  const variant = await campaignVariant(supabase, org.id, id, variantId);
  if (!variant) back(id, "error", "Variant not found.");
  const { error } = await supabase.from("campaign_step_variants").update(fields!).eq("id", variantId).eq("organization_id", org.id);
  if (error) back(id, "error", "Could not save the variant.");
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Variant saved.");
}
export async function deleteVariant(id: string, variantId: string) {
  const { supabase, org } = await stepsEditable(id);
  const variant = await campaignVariant(supabase, org.id, id, variantId);
  if (!variant) back(id, "error", "Variant not found.");
  const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("variant_id", variantId).eq("organization_id", org.id);
  // A variant that already sent is archived so its results keep their label.
  if (count) {
    const { error } = await supabase.from("campaign_step_variants").update({ active: false }).eq("id", variantId).eq("organization_id", org.id);
    if (error) back(id, "error", "Could not archive the variant.");
    revalidatePath(`/app/campaigns/${id}`);
    back(id, "msg", "Variant archived. Its results are kept.");
  }
  const { error } = await supabase.from("campaign_step_variants").delete().eq("id", variantId).eq("organization_id", org.id);
  if (error) back(id, "error", "Could not delete the variant.");
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Variant deleted.");
}
const testSchema = z.object({ variant: z.union([z.literal("a"), uuid]), mailbox: uuid });
// A test changes no campaign state, so it is allowed while the campaign is active.
export async function sendTestStep(id: string, stepId: string, formData: FormData) {
  const { supabase, org, user } = await editableCampaign(id);
  const parsed = testSchema.safeParse({ variant: formData.get("variant") ?? "a", mailbox: formData.get("mailbox") });
  if (!parsed.success || !uuid.safeParse(stepId).success) back(id, "error", "Choose a mailbox to send the test from.");
  const { variant, mailbox: mailboxId } = parsed.data!;
  const to = user.email?.trim();
  if (!to) back(id, "error", "Your account has no email address to send the test to.");
  const { data: step } = await supabase.from("campaign_steps").select("id, type, subject, body_plain").eq("id", stepId).eq("campaign_id", id).eq("organization_id", org.id).maybeSingle();
  if (!step || step.type !== "email") back(id, "error", "Only email steps can be tested.");
  let subjectTemplate = step!.subject ?? "";
  let bodyTemplate = step!.body_plain ?? "";
  if (variant !== "a") {
    const { data: v } = await supabase.from("campaign_step_variants").select("subject, body_plain").eq("id", variant).eq("step_id", stepId).eq("organization_id", org.id).eq("active", true).maybeSingle();
    if (!v) back(id, "error", "Variant not found.");
    subjectTemplate = v!.subject;
    bodyTemplate = v!.body_plain;
  }
  const { data: mailbox } = await supabase.from("mailboxes").select("*").eq("id", mailboxId).eq("organization_id", org.id).maybeSingle();
  if (!mailbox) back(id, "error", "Mailbox not found.");
  const { data: sample } = await supabase.from("contacts").select("*").eq("organization_id", org.id).order("created_at").limit(1).maybeSingle();
  const data = sample ? contactData(sample) : SAMPLE_CONTACT;
  const subject = renderTemplate(subjectTemplate, data);
  const text = renderTemplate(bodyTemplate, data);
  if (!subject.ok || !text.ok) {
    const missing = [...new Set([...(subject.ok ? [] : subject.missing), ...(text.ok ? [] : text.missing)])];
    back(id, "error", `The sample contact has no value for: ${missing.join(", ")}. Add a fallback such as {{first_name|there}}.`);
  }
  const outcome = await sendStepTest(createAdminClient(), mailbox!, {
    to: to!,
    subject: subject.text,
    text: text.text,
    testKey: `${stepId}:${variant}`,
    baseUrl: publicEnv().NEXT_PUBLIC_APP_URL,
  });
  if (!outcome.ok) back(id, "error", outcome.message);
  back(id, "msg", `Test sent to ${to}.`);
}
export async function enrollContacts(id: string, formData: FormData) {
  const { supabase, org } = await editableCampaign(id);
  const label = String(formData.get("label") ?? "all");
  let ids: string[] = [];
  if (label === "all") {
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("contacts").select("id").eq("organization_id", org.id).eq("subscribed", true).order("id").range(from, from + 999);
      ids = ids.concat((data ?? []).map((c) => c.id));
      if (!data || data.length < 1000) break;
    }
  } else if (uuid.safeParse(label).success) {
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("contact_labels").select("contact_id").eq("label_id", label).eq("organization_id", org.id).order("contact_id").range(from, from + 999);
      ids = ids.concat((data ?? []).map((c) => c.contact_id));
      if (!data || data.length < 1000) break;
    }
  }
  let added = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const { data, error } = await supabase.rpc("enroll_contacts", { p_campaign: id, p_contact_ids: ids.slice(i, i + 1000) });
    if (error) back(id, "error", "Could not enroll contacts.");
    added += data ?? 0;
  }
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", `Enrolled ${added} contacts. Unsubscribed and suppressed contacts are skipped.`);
}
