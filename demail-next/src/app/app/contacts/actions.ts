"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { EMAIL_PATTERN } from "@/lib/csv";
import type { Json } from "@/lib/database.types";

const text = z.string().trim().max(200).optional().transform((v) => v || null);
const contactSchema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_PATTERN).max(320),
  first_name: text,
  last_name: text,
  company: text,
  phone: text,
});

function fields(formData: FormData) {
  return contactSchema.safeParse({
    email: formData.get("email"),
    first_name: formData.get("first_name") ?? undefined,
    last_name: formData.get("last_name") ?? undefined,
    company: formData.get("company") ?? undefined,
    phone: formData.get("phone") ?? undefined,
  });
}

export async function createContact(formData: FormData) {
  const { supabase, org } = await getOrgContext();
  const parsed = fields(formData);
  if (!parsed.success) redirect("/app/contacts/new?error=" + encodeURIComponent("Enter a valid email address."));
  const { data, error } = await supabase.from("contacts").insert({ ...parsed.data, organization_id: org.id }).select("id").single();
  if (error || !data) redirect("/app/contacts/new?error=" + encodeURIComponent(error?.code === "23505" ? "That email already exists." : "Could not create the contact."));
  revalidatePath("/app/contacts");
  redirect(`/app/contacts/${data.id}`);
}

export async function updateContact(id: string, formData: FormData) {
  const { supabase, org } = await getOrgContext();
  const parsed = fields(formData);
  if (!parsed.success) redirect(`/app/contacts/${id}?error=` + encodeURIComponent("Enter a valid email address."));
  const { error } = await supabase.from("contacts").update(parsed.data).eq("id", id).eq("organization_id", org.id);
  if (error) redirect(`/app/contacts/${id}?error=` + encodeURIComponent(error.code === "23505" ? "That email already exists." : "Could not save the contact."));
  revalidatePath("/app/contacts");
  redirect(`/app/contacts/${id}?saved=1`);
}

export async function deleteContact(id: string) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) redirect(`/app/contacts/${id}?error=` + encodeURIComponent("Only owners and admins can delete contacts."));
  await supabase.from("contacts").delete().eq("id", id).eq("organization_id", org.id);
  revalidatePath("/app/contacts");
  redirect("/app/contacts");
}

export async function createLabel(returnTo: string, formData: FormData) {
  const { supabase, org } = await getOrgContext();
  const name = String(formData.get("name") ?? "").trim();
  const dest = returnTo.startsWith("/app/") ? returnTo : "/app/contacts";
  if (name) await supabase.from("labels").insert({ name: name.slice(0, 60), organization_id: org.id });
  revalidatePath(dest);
  redirect(dest);
}

export async function setContactLabel(contactId: string, labelId: string, on: boolean) {
  const { supabase, org } = await getOrgContext();
  // Composite foreign keys reject a label or contact from another organization.
  if (on) await supabase.from("contact_labels").upsert({ contact_id: contactId, label_id: labelId, organization_id: org.id });
  else await supabase.from("contact_labels").delete().eq("contact_id", contactId).eq("label_id", labelId).eq("organization_id", org.id);
  revalidatePath(`/app/contacts/${contactId}`);
}

const importSchema = z.array(
  z.object({
    email: z.string().max(320).optional(),
    first_name: z.string().max(200).optional(),
    last_name: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    phone: z.string().max(200).optional(),
    custom: z.record(z.string().max(100), z.string().max(1000)).optional(),
  }),
).max(50000);

export type ImportResult = { created: number; updated: number; skipped: number; invalid: number; error?: string };

const BATCH = 500;
const LOOKUP = 100;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function importContacts(rows: unknown): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, invalid: 0 };
  const { supabase, org } = await getOrgContext();
  const parsed = importSchema.safeParse(rows);
  if (!parsed.success) return { ...result, error: "The file could not be read. Check the column mapping." };

  // Validate, lowercase and dedupe by email; later rows in the file win.
  const byEmail = new Map<string, (typeof parsed.data)[number]>();
  for (const row of parsed.data) {
    const email = (row.email ?? "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 320) {
      result.invalid++;
      continue;
    }
    if (byEmail.has(email)) result.skipped++;
    byEmail.set(email, row);
  }
  const emails = [...byEmail.keys()];

  const suppressed = new Set<string>();
  for (const part of chunks(emails, LOOKUP)) {
    const { data } = await supabase.from("suppressed_recipients").select("email").eq("organization_id", org.id).in("email", part);
    data?.forEach((r) => suppressed.add(r.email.toLowerCase()));
  }
  const allowed = emails.filter((e) => !suppressed.has(e));
  result.skipped += emails.length - allowed.length;

  const existing = new Map<string, { id: string; custom_fields: Json; first_name: string | null; last_name: string | null; company: string | null; phone: string | null }>();
  for (const part of chunks(allowed, LOOKUP)) {
    const { data } = await supabase.from("contacts").select("id, email, first_name, last_name, company, phone, custom_fields").eq("organization_id", org.id).in("email", part);
    data?.forEach((c) => existing.set(c.email.toLowerCase(), c));
  }

  for (const part of chunks(allowed, BATCH)) {
    const inserts = [];
    const updates = [];
    for (const email of part) {
      const row = byEmail.get(email)!;
      const prev = existing.get(email);
      if (!prev) {
        inserts.push({
          organization_id: org.id,
          email,
          first_name: row.first_name || null,
          last_name: row.last_name || null,
          company: row.company || null,
          phone: row.phone || null,
          custom_fields: (row.custom ?? {}) as Json,
        });
      } else {
        const prevCustom = prev.custom_fields && typeof prev.custom_fields === "object" && !Array.isArray(prev.custom_fields) ? prev.custom_fields : {};
        updates.push({
          id: prev.id,
          organization_id: org.id,
          email,
          first_name: row.first_name || prev.first_name,
          last_name: row.last_name || prev.last_name,
          company: row.company || prev.company,
          phone: row.phone || prev.phone,
          custom_fields: { ...prevCustom, ...(row.custom ?? {}) } as Json,
        });
      }
    }
    if (inserts.length) {
      const { error } = await supabase.from("contacts").insert(inserts);
      if (error) return { ...result, error: "Import stopped after a database error. Counts so far are shown." };
      result.created += inserts.length;
    }
    if (updates.length) {
      const { error } = await supabase.from("contacts").upsert(updates, { onConflict: "id" });
      if (error) return { ...result, error: "Import stopped after a database error. Counts so far are shown." };
      result.updated += updates.length;
    }
  }
  revalidatePath("/app/contacts");
  return result;
}
