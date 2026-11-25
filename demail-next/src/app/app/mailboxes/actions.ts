"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { EMAIL_PATTERN } from "@/lib/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { readRefreshToken } from "@/lib/mail/credentials";
import { revokeGoogle } from "@/lib/mail/oauth";
const schema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_PATTERN).max(320),
  from_name: z.string().trim().max(200),
  daily_limit: z.coerce.number().int().min(1).max(5000),
  min_gap_seconds: z.coerce.number().int().min(0).max(86400),
  status: z.enum(["active", "paused", "disconnected"]),
});
const fail = (message: string): never => redirect("/app/mailboxes?error=" + encodeURIComponent(message));
export async function addMailbox(formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can add sender identities.");
  const parsed = schema.safeParse({
    email: formData.get("email"),
    from_name: formData.get("from_name") ?? "",
    daily_limit: formData.get("daily_limit"),
    min_gap_seconds: formData.get("min_gap_seconds"),
    status: formData.get("status"),
  });
  if (!parsed.success) return fail("Check the email address, daily limit and minimum gap.");
  const { error } = await supabase.from("mailboxes").insert({ ...parsed.data, organization_id: org.id });
  if (error) return fail(error.code === "23505" ? "That sender already exists." : "Could not add the sender.");
  revalidatePath("/app/mailboxes");
  redirect("/app/mailboxes");
}
export async function setMailboxStatus(id: string, status: "active" | "paused") {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can change senders.");
  await supabase.from("mailboxes").update({ status }).eq("id", id).eq("organization_id", org.id);
  revalidatePath("/app/mailboxes");
}
export async function deleteMailbox(id: string) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can remove senders.");
  const { data: mailbox } = await supabase.from("mailboxes").select("provider").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (mailbox?.provider === "google") {
    const token = await readRefreshToken(createAdminClient(), id, org.id);
    if (token) await revokeGoogle(token);
  }
  await supabase.from("mailboxes").delete().eq("id", id).eq("organization_id", org.id);
  revalidatePath("/app/mailboxes");
}
