"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";

const uuid = z.string().uuid();
const MAX_SELECTED = 100;

function done(returnTo: string, key: "error" | "msg", message: string): never {
  const base = returnTo.startsWith("/app/contacts") ? returnTo : "/app/contacts";
  const url = new URL(base, "http://local");
  url.searchParams.delete("error");
  url.searchParams.delete("msg");
  url.searchParams.set(key, message);
  return redirect(`${url.pathname}${url.search}`);
}

// Bulk actions on the rows ticked in the contacts list. Every statement is scoped to the caller's organization.
export async function bulkContacts(formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  const returnTo = String(formData.get("return") ?? "/app/contacts");
  const ids = [...new Set(formData.getAll("id").map(String))];
  if (ids.length === 0) done(returnTo, "error", "Tick at least one contact.");
  if (ids.length > MAX_SELECTED || !ids.every((i) => uuid.safeParse(i).success)) done(returnTo, "error", `Select up to ${MAX_SELECTED} contacts at a time.`);
  const op = String(formData.get("op") ?? "");

  if (op === "label_add" || op === "label_remove") {
    const label = String(formData.get("label") ?? "");
    if (!uuid.safeParse(label).success) done(returnTo, "error", "Pick a label.");
    if (op === "label_add") {
      // Composite foreign keys reject a label or contact from another organization.
      const { error } = await supabase.from("contact_labels").upsert(ids.map((contact_id) => ({ contact_id, label_id: label, organization_id: org.id })));
      if (error) done(returnTo, "error", "Could not add the label.");
    } else {
      await supabase.from("contact_labels").delete().eq("label_id", label).eq("organization_id", org.id).in("contact_id", ids);
    }
    revalidatePath("/app/contacts");
    done(returnTo, "msg", op === "label_add" ? "Label added." : "Label removed.");
  }

  if (op === "enroll") {
    const campaign = String(formData.get("campaign") ?? "");
    if (!uuid.safeParse(campaign).success) done(returnTo, "error", "Pick a campaign.");
    const { data: camp } = await supabase.from("campaigns").select("id, status").eq("id", campaign).eq("organization_id", org.id).maybeSingle();
    if (!camp || camp.status === "completed") done(returnTo, "error", "Pick a campaign that has not completed.");
    // enroll_contacts matches contacts by organization, so ids from another workspace enroll nothing.
    const { data: own } = await supabase.from("contacts").select("id").eq("organization_id", org.id).in("id", ids);
    const { data, error } = await supabase.rpc("enroll_contacts", { p_campaign: camp.id, p_contact_ids: (own ?? []).map((c) => c.id) });
    if (error) done(returnTo, "error", "Could not enroll contacts.");
    revalidatePath(`/app/campaigns/${camp.id}`);
    done(returnTo, "msg", `Enrolled ${data ?? 0} of ${ids.length} contacts. Unsubscribed, suppressed and already enrolled contacts are skipped.`);
  }

  if (op === "delete") {
    if (!canManage) done(returnTo, "error", "Only owners and admins can delete contacts.");
    const { error } = await supabase.from("contacts").delete().eq("organization_id", org.id).in("id", ids);
    if (error) done(returnTo, "error", "Could not delete the contacts.");
    revalidatePath("/app/contacts");
    done(returnTo, "msg", `Deleted ${ids.length} contacts.`);
  }

  done(returnTo, "error", "Pick an action.");
}
