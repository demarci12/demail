"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { cleanText } from "@/lib/input";
import type { Json } from "@/lib/database.types";
import { readRules, rulesFromForm } from "@/lib/segments/rules";

const uuid = z.string().uuid();
const MAX_ENROLL = 50000;

function go(path: string, key: "error" | "msg", message: string): never {
  return redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

export async function saveSegment(id: string | null, formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  const here = id ? `/app/segments/${id}` : "/app/segments/new";
  if (!canManage) go(here, "error", "Only owners and admins can change segments.");
  if (id && !uuid.safeParse(id).success) redirect("/app/segments");
  const name = cleanText(formData.get("name"), 80);
  if (!name) go(here, "error", "Give the segment a name.");
  const { data: labelRows } = await supabase.from("labels").select("id, name").eq("organization_id", org.id);
  const parsed = rulesFromForm(formData, labelRows ?? []);
  if ("error" in parsed) go(here, "error", parsed.error);

  const campaignId = String(formData.get("campaign_id") ?? "");
  let campaign: string | null = null;
  if (campaignId) {
    if (!uuid.safeParse(campaignId).success) go(here, "error", "Pick a campaign from the list.");
    const { data } = await supabase.from("campaigns").select("id, status").eq("id", campaignId).eq("organization_id", org.id).maybeSingle();
    if (!data || data.status === "completed") go(here, "error", "Pick a campaign that has not completed.");
    campaign = data.id;
  }
  const live = formData.get("live") === "on";
  if (live && !campaign) go(here, "error", "Pick a campaign to link before turning the live link on.");

  const row = { name, rules: parsed.rules as unknown as Json, campaign_id: campaign, live };
  if (id) {
    const { error } = await supabase.from("segments").update(row).eq("id", id).eq("organization_id", org.id);
    if (error) go(here, "error", error.code === "23505" ? "A segment with that name already exists." : "Could not save the segment.");
    revalidatePath("/app/segments");
    go(here, "msg", "Saved.");
  }
  const { data, error } = await supabase.from("segments").insert({ ...row, organization_id: org.id }).select("id").single();
  if (error || !data) go(here, "error", error?.code === "23505" ? "A segment with that name already exists." : "Could not save the segment.");
  revalidatePath("/app/segments");
  redirect(`/app/segments/${data.id}?msg=${encodeURIComponent("Segment saved.")}`);
}

export async function deleteSegment(id: string) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage || !uuid.safeParse(id).success) redirect("/app/segments");
  await supabase.from("segments").delete().eq("id", id).eq("organization_id", org.id);
  revalidatePath("/app/segments");
  redirect("/app/segments");
}

// Enrolls every subscribed match now. Suppressed addresses are skipped by enroll_contacts itself.
export async function enrollSegment(id: string, formData: FormData) {
  const { supabase, org } = await getOrgContext();
  const here = `/app/segments/${id}`;
  const campaignId = String(formData.get("campaign_id") ?? "");
  if (!uuid.safeParse(id).success || !uuid.safeParse(campaignId).success) go(here, "error", "Pick a campaign.");
  const [{ data: seg }, { data: camp }] = await Promise.all([
    supabase.from("segments").select("rules").eq("id", id).eq("organization_id", org.id).maybeSingle(),
    supabase.from("campaigns").select("id, status").eq("id", campaignId).eq("organization_id", org.id).maybeSingle(),
  ]);
  if (!seg || !camp || camp.status === "completed") go(here, "error", "Pick a campaign that has not completed.");
  const rules = readRules(seg.rules) as unknown as Json;
  let ids: string[] = [];
  for (let from = 0; ids.length < MAX_ENROLL; from += 1000) {
    const { data, error } = await supabase.rpc("contacts_search", { p_org: org.id, p_rules: rules, p_extra: null, p_q: null }).select("id, subscribed").range(from, from + 999);
    if (error) go(here, "error", "Could not read the segment.");
    ids = ids.concat((data ?? []).filter((c) => c.subscribed).map((c) => c.id));
    if (!data || data.length < 1000) break;
  }
  let added = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const { data, error } = await supabase.rpc("enroll_contacts", { p_campaign: camp.id, p_contact_ids: ids.slice(i, i + 1000) });
    if (error) go(here, "error", "Could not enroll contacts.");
    added += data ?? 0;
  }
  revalidatePath(`/app/campaigns/${camp.id}`);
  go(here, "msg", `Enrolled ${added} of ${ids.length} matching contacts. Unsubscribed, suppressed and already enrolled contacts are skipped.`);
}
