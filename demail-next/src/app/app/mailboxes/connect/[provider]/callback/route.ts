import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { oauthProviders, publicEnv } from "@/lib/env";
import { open } from "@/lib/crypto/secretbox";
import { OAUTH_COOKIE, exchangeCode, fetchProfile, isProvider } from "@/lib/mail/oauth";
import { saveCredentials } from "@/lib/mail/credentials";
type Pending = { state: string; verifier: string; provider: string; org: string; user: string };
function done(query: string) {
  const res = NextResponse.redirect(new URL("/app/mailboxes?" + query, publicEnv().NEXT_PUBLIC_APP_URL));
  res.cookies.set(OAUTH_COOKIE, "", { path: "/app/mailboxes/connect", maxAge: 0 });
  return res;
}
const fail = (message: string) => done("error=" + encodeURIComponent(message));
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider) || !oauthProviders()[provider]) return fail("That provider is not configured on this instance.");
  let pending: Pending;
  try {
    pending = JSON.parse(open(req.cookies.get(OAUTH_COOKIE)?.value ?? "")) as Pending;
  } catch {
    return fail("The connect session expired. Start again.");
  }
  const q = req.nextUrl.searchParams;
  if (pending.provider !== provider || !q.get("state") || q.get("state") !== pending.state) return fail("The connect session did not match. Start again.");
  const code = q.get("code");
  if (q.get("error") || !code) return fail("The provider did not grant access.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.id !== pending.user) return fail("Sign in again and retry.");
  const { data: member } = await supabase.from("organization_members").select("role").eq("organization_id", pending.org).eq("user_id", auth.user.id).maybeSingle();
  if (!member || (member.role !== "owner" && member.role !== "admin")) return fail("Only owners and admins can connect mailboxes.");
  try {
    const tokens = await exchangeCode(provider, code, pending.verifier);
    if (!tokens.refresh_token) return fail("The provider returned no refresh token. Remove the app from the account's connected apps and retry.");
    const profile = await fetchProfile(provider, tokens.access_token);
    const admin = createAdminClient();
    const fields = { provider, provider_account_id: profile.accountId, status: "active" as const, last_error: null };
    const { data: existing } = await admin.from("mailboxes").select("id").eq("organization_id", pending.org).eq("email", profile.email).maybeSingle();
    let mailboxId = existing?.id;
    if (mailboxId) {
      const { error } = await admin.from("mailboxes").update(fields).eq("id", mailboxId).eq("organization_id", pending.org);
      if (error) throw new Error("update failed");
    } else {
      const { data, error } = await admin
        .from("mailboxes")
        .insert({ ...fields, organization_id: pending.org, email: profile.email, from_name: profile.name ?? "", created_by: auth.user.id })
        .select("id")
        .single();
      if (error || !data) throw new Error("insert failed");
      mailboxId = data.id;
    }
    await saveCredentials(admin, { id: mailboxId, organization_id: pending.org }, { ...tokens, refresh_token: tokens.refresh_token });
    const { error: syncError } = await admin
      .from("mailbox_sync_state")
      .upsert({ mailbox_id: mailboxId, organization_id: pending.org, cursor: null, next_sync_at: new Date().toISOString(), consecutive_errors: 0 });
    if (syncError) throw new Error("sync state failed");
    return done("message=" + encodeURIComponent(`Connected ${profile.email}.`));
  } catch {
    return fail("Could not connect the mailbox. Check the provider settings and try again.");
  }
}
