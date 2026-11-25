"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { EMAIL_PATTERN } from "@/lib/csv";
const schema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_PATTERN).max(320),
  reason: z.string().trim().max(300).optional().transform((v) => v || null),
});
export async function addSuppression(formData: FormData) {
  const { supabase, org } = await getOrgContext();
  const parsed = schema.safeParse({ email: formData.get("email"), reason: formData.get("reason") ?? undefined });
  if (!parsed.success) redirect("/app/suppression?error=" + encodeURIComponent("Enter a valid email address."));
  const { error } = await supabase.from("suppressed_recipients").insert({ ...parsed.data, organization_id: org.id, source: "manual" });
  if (error && error.code !== "23505") redirect("/app/suppression?error=" + encodeURIComponent("Could not add the address."));
  revalidatePath("/app/suppression");
  redirect("/app/suppression");
}
export async function removeSuppression(id: string) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) redirect("/app/suppression?error=" + encodeURIComponent("Only owners and admins can remove addresses."));
  await supabase.from("suppressed_recipients").delete().eq("id", id).eq("organization_id", org.id);
  revalidatePath("/app/suppression");
}
