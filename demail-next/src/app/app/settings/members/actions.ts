"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { publicEnv } from "@/lib/env";

export type InviteState = { link?: string; error?: string };

const inviteSchema = z.object({ email: z.string().trim().email(), role: z.enum(["member", "admin"]) });

export async function createInvite(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return { error: "Only owners and admins can invite." };
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: "Enter a valid email address." };
  const { data, error } = await supabase.rpc("create_invitation", {
    org: org.id,
    invitee_email: parsed.data.email,
    invitee_role: parsed.data.role,
  });
  if (error || !data) return { error: "Could not create the invitation." };
  revalidatePath("/app/settings/members");
  return { link: `${publicEnv().NEXT_PUBLIC_APP_URL}/invite/${data}` };
}

const roleSchema = z.object({ user_id: z.string().uuid(), role: z.enum(["member", "admin", "owner"]) });

export async function changeRole(formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return;
  const parsed = roleSchema.safeParse({ user_id: formData.get("user_id"), role: formData.get("role") });
  if (!parsed.success) return;
  // RLS decides who may grant owner or touch an owner.
  await supabase.from("organization_members").update({ role: parsed.data.role }).eq("organization_id", org.id).eq("user_id", parsed.data.user_id);
  revalidatePath("/app/settings/members");
}
