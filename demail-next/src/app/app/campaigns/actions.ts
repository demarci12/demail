"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
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
export async function addStep(id: string, type: "email" | "wait", formData: FormData) {
  const { supabase, org } = await stepsEditable(id);
  const fields = stepFields(type, formData);
  if (!fields) back(id, "error", type === "email" ? "An email step needs a subject and a body." : "A wait step needs an amount and a unit.");
  const { data: last } = await supabase.from("campaign_steps").select("position").eq("campaign_id", id).eq("organization_id", org.id).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("campaign_steps").insert({ ...fields!, campaign_id: id, organization_id: org.id, position: (last?.position ?? -1) + 1 });
  if (error) back(id, "error", "Could not add the step.");
  revalidatePath(`/app/campaigns/${id}`);
  back(id, "msg", "Step added.");
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
