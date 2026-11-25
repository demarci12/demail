import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const ORG_COOKIE = "demail_org";
export type Role = "owner" | "admin" | "member";

// Resolves the signed-in user and current organization; the cookie is only a hint checked against membership.
export const getOrgContext = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: members } = await supabase.from("organization_members").select("organization_id, role").eq("user_id", auth.user.id);
  if (!members || members.length === 0) redirect("/onboarding");
  const { data: orgRows } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", members.map((m) => m.organization_id));
  const orgs = (orgRows ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const org = orgs.find((o) => o.id === wanted) ?? orgs[0];
  if (!org) redirect("/onboarding");
  const role = members.find((m) => m.organization_id === org.id)!.role;
  return { supabase, user: auth.user, org, orgs, role, canManage: role === "owner" || role === "admin" };
});

export async function setOrgCookie(id: string) {
  (await cookies()).set(ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

// Only same-site paths are accepted as a post-login destination.
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/app") {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
