"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { FIELD_TYPES, MAPS_TO, cleanText, normalizeRedirectUrl, parseFields, type FieldType, type FormField, type MapsTo } from "@/lib/input";
const LIST = "/app/forms";
const uuid = z.string().uuid();
const FIELD_RULES =
  "Could not save the field. Keys use lowercase letters, digits and underscores, dropdowns need options, checkboxes map to a custom field or nothing, each contact field is mapped once, a file field only keeps the answer (up to 3 per form), and the form keeps one required email field mapped to Email.";
const fail = (message: string): never => redirect(`${LIST}?error=${encodeURIComponent(message)}`);
function back(id: string, key: "error" | "msg", message: string): never {
  revalidatePath(`${LIST}/${id}`);
  return redirect(`${LIST}/${id}?${key}=${encodeURIComponent(message)}`);
}
async function loadForm(id: string) {
  if (!uuid.safeParse(id).success) redirect(LIST);
  const ctx = await getOrgContext();
  const { data: form } = await ctx.supabase.from("forms").select("id, fields").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!form) redirect(LIST);
  return { ...ctx, form };
}
async function saveFields(id: string, next: unknown[]) {
  const { supabase, org } = await getOrgContext();
  const fields = parseFields(next);
  if (!fields) return back(id, "error", FIELD_RULES);
  const { error } = await supabase.from("forms").update({ fields }).eq("id", id).eq("organization_id", org.id);
  if (error) return back(id, "error", "Could not save the fields.");
  return back(id, "msg", "Fields saved.");
}
function currentFields(id: string, raw: unknown): FormField[] {
  const fields = parseFields(raw);
  if (!fields) return back(id, "error", "The saved fields could not be read.");
  return fields;
}
// Reads the editable parts of a field; the key is set once when the field is added.
function fieldInput(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const maps_to = String(formData.get("maps_to") ?? "");
  const options = String(formData.get("options") ?? "")
    .split("\n")
    .map((o) => cleanText(o, 100))
    .filter(Boolean);
  const placeholder = cleanText(formData.get("placeholder"), 100);
  return {
    label: cleanText(formData.get("label"), 100),
    type: (FIELD_TYPES.includes(type as FieldType) ? type : "") as FieldType,
    required: formData.get("required") === "on",
    maps_to: (MAPS_TO.includes(maps_to as MapsTo) ? maps_to : "") as MapsTo,
    ...(type === "select" ? { options } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(formData.get("page_break") === "on" ? { page_break: true as const } : {}),
  };
}
function fieldIndex(id: string, index: number, fields: FormField[]) {
  if (!Number.isInteger(index) || index < 0 || index >= fields.length) return back(id, "error", "That field no longer exists.");
  return index;
}

export async function createForm(formData: FormData) {
  const { supabase, org } = await getOrgContext();
  const name = cleanText(formData.get("name"), 100);
  if (!name) return fail("Give the form a name of 1 to 100 characters.");
  const { data, error } = await supabase.from("forms").insert({ organization_id: org.id, name }).select("id").single();
  if (error || !data) return fail("Could not create the form.");
  revalidatePath(LIST);
  return redirect(`${LIST}/${data.id}`);
}

export async function saveForm(id: string, formData: FormData) {
  const { supabase, org } = await loadForm(id);
  const name = cleanText(formData.get("name"), 100);
  const title = cleanText(formData.get("title"), 200);
  const intro = cleanText(formData.get("intro"), 2000, true);
  const submit_label = cleanText(formData.get("submit_label"), 40);
  const success_message = cleanText(formData.get("success_message"), 500, true);
  const consent_text = cleanText(formData.get("consent_text"), 1000, true) || null;
  const accent_color = String(formData.get("accent_color") ?? "")
    .trim()
    .toLowerCase();
  const layout = String(formData.get("layout") ?? "");
  const daily_limit = Number(formData.get("daily_limit"));
  const theme = String(formData.get("theme") ?? "");
  const focus_mode = formData.get("focus_mode") === "on";
  const rawRedirect = cleanText(formData.get("redirect_url"), 1000);
  const redirect_url = rawRedirect ? normalizeRedirectUrl(rawRedirect) : null;
  if (!name) return back(id, "error", "Give the form a name of 1 to 100 characters.");
  if (!submit_label) return back(id, "error", "The button text needs 1 to 40 characters.");
  if (!success_message) return back(id, "error", "The success message needs 1 to 500 characters.");
  if (!/^#[0-9a-f]{6}$/.test(accent_color)) return back(id, "error", "Pick an accent color like #0284c7.");
  if (layout !== "card" && layout !== "plain") return back(id, "error", "Pick a layout.");
  if (!Number.isInteger(daily_limit) || daily_limit < 1 || daily_limit > 10000) return back(id, "error", "The daily limit is a whole number from 1 to 10000.");
  if (theme !== "light" && theme !== "dark" && theme !== "soft") return back(id, "error", "Pick a theme.");
  if (rawRedirect && !redirect_url) return back(id, "error", "The redirect must be a full https address on a public domain, up to 500 characters.");
  const rawLabel = String(formData.get("label_id") ?? "");
  let label_id: string | null = null;
  if (rawLabel) {
    if (!uuid.safeParse(rawLabel).success) return back(id, "error", "Pick a label from the list.");
    const { data: label } = await supabase.from("labels").select("id").eq("id", rawLabel).eq("organization_id", org.id).maybeSingle();
    if (!label) return back(id, "error", "Pick a label from the list.");
    label_id = label.id;
  }
  const rawCampaign = String(formData.get("campaign_id") ?? "");
  let campaign_id: string | null = null;
  if (rawCampaign) {
    if (!uuid.safeParse(rawCampaign).success) return back(id, "error", "Pick a campaign from the list.");
    const { data: campaign } = await supabase.from("campaigns").select("id").eq("id", rawCampaign).eq("organization_id", org.id).maybeSingle();
    if (!campaign) return back(id, "error", "Pick a campaign from the list.");
    campaign_id = campaign.id;
  }
  const { error } = await supabase
    .from("forms")
    .update({ name, title, intro, submit_label, success_message, consent_text, accent_color, layout, theme, focus_mode, redirect_url, daily_limit, label_id, campaign_id, published: formData.get("published") === "on" })
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return back(id, "error", "Could not save the form.");
  revalidatePath(LIST);
  return back(id, "msg", "Form saved.");
}

export async function addField(id: string, formData: FormData) {
  const { form } = await loadForm(id);
  const fields = currentFields(id, form.fields);
  const key = String(formData.get("key") ?? "").trim();
  return saveFields(id, [...fields, { key, ...fieldInput(formData) }]);
}

export async function updateField(id: string, index: number, formData: FormData) {
  const { form } = await loadForm(id);
  const fields = currentFields(id, form.fields);
  const i = fieldIndex(id, index, fields);
  const next = fields.map((f, j) => (j === i ? { key: f.key, ...fieldInput(formData) } : f));
  return saveFields(id, next);
}

export async function moveField(id: string, index: number, direction: "up" | "down") {
  const { form } = await loadForm(id);
  const fields = currentFields(id, form.fields);
  const i = fieldIndex(id, index, fields);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= fields.length) return back(id, "msg", "Fields saved.");
  const next = [...fields];
  [next[i], next[j]] = [next[j], next[i]];
  return saveFields(id, next);
}

export async function removeField(id: string, index: number) {
  const { form } = await loadForm(id);
  const fields = currentFields(id, form.fields);
  const i = fieldIndex(id, index, fields);
  if (fields[i].maps_to === "email") return back(id, "error", "The email field cannot be removed.");
  return saveFields(id, fields.filter((_, j) => j !== i));
}

export async function deleteForm(id: string) {
  const { supabase, org, canManage } = await loadForm(id);
  if (!canManage) return back(id, "error", "Only owners and admins can delete a form.");
  const { error } = await supabase.from("forms").delete().eq("id", id).eq("organization_id", org.id);
  if (error) return back(id, "error", "Could not delete the form.");
  revalidatePath(LIST);
  return redirect(`${LIST}?msg=${encodeURIComponent("Form deleted with its submissions. Contacts stay.")}`);
}

// Mail settings are owner and admin only (the database enforces it too): notifications to members and double opt-in links to visitors, both off by default.
export async function saveFormMail(id: string, formData: FormData) {
  const { supabase, org, canManage } = await loadForm(id);
  if (!canManage) return back(id, "error", "Only owners and admins can change form mail settings.");
  const notify_enabled = formData.get("notify_enabled") === "on";
  const double_opt_in = formData.get("double_opt_in") === "on";
  const rawMailbox = String(formData.get("mail_mailbox_id") ?? "");
  let mail_mailbox_id: string | null = null;
  if (rawMailbox) {
    if (!uuid.safeParse(rawMailbox).success) return back(id, "error", "Pick a mailbox from the list.");
    const { data: mailbox } = await supabase.from("mailboxes").select("id").eq("id", rawMailbox).eq("organization_id", org.id).eq("status", "active").maybeSingle();
    if (!mailbox) return back(id, "error", "Pick an active mailbox from the list.");
    mail_mailbox_id = mailbox.id;
  }
  if ((notify_enabled || double_opt_in) && !mail_mailbox_id) return back(id, "error", "Pick the mailbox that sends this form's mail.");
  const picked = [...new Set(formData.getAll("recipient").map(String))].filter((r) => uuid.safeParse(r).success);
  if (picked.length > 5) return back(id, "error", "Pick at most 5 recipients.");
  let recipients: string[] = [];
  if (picked.length) {
    const { data: members } = await supabase.from("organization_members").select("user_id").eq("organization_id", org.id).in("user_id", picked);
    recipients = (members ?? []).map((m) => m.user_id);
  }
  if (notify_enabled && recipients.length === 0) return back(id, "error", "Pick at least one member to notify.");
  const { error } = await supabase.from("forms").update({ notify_enabled, double_opt_in, mail_mailbox_id }).eq("id", id).eq("organization_id", org.id);
  if (error) return back(id, "error", "Could not save the mail settings.");
  const keep = recipients.length ? `(${recipients.join(",")})` : "(00000000-0000-0000-0000-000000000000)";
  const { error: delError } = await supabase.from("form_notify_recipients").delete().eq("form_id", id).eq("organization_id", org.id).not("user_id", "in", keep);
  if (recipients.length) {
    const { error: addError } = await supabase
      .from("form_notify_recipients")
      .upsert(recipients.map((user_id) => ({ organization_id: org.id, form_id: id, user_id })), { onConflict: "form_id,user_id", ignoreDuplicates: true });
    if (addError) return back(id, "error", "Could not save the recipients.");
  }
  if (delError) return back(id, "error", "Could not save the recipients.");
  return back(id, "msg", "Mail settings saved.");
}
