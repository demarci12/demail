import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const ORG_COOKIE = "demail_org";
export type Role = "owner" | "admin" | "member";

export type Workspace = { id: string; name: string; is_agency: boolean; agency_id: string | null; via_agency: boolean };
// Resolves the signed-in user and current organization; the cookie is only a hint checked against my_workspaces.
export const getOrgContext = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: rows, error } = await supabase.rpc("my_workspaces");
  if (error) throw new Error("Could not load workspaces.");
  if (!rows || rows.length === 0) redirect("/onboarding");
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = sorted.find((o) => o.id === wanted) ?? sorted[0];
  const orgs: Workspace[] = sorted.map(({ id, name, is_agency, agency_id, via_agency }) => ({ id, name, is_agency, agency_id, via_agency }));
  const org = orgs.find((o) => o.id === current.id)!;
  const role: Role = current.role;
  return { supabase, user: auth.user, org, orgs, role, canManage: role === "owner" || role === "admin" };
});
export async function setOrgCookie(id: string) {
  (await cookies()).set(ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

// Only same-site paths are accepted as a post-login destination.
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/app") {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
