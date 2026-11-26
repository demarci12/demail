import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { oauthProviders, publicEnv } from "@/lib/env";
import { open } from "@/lib/crypto/secretbox";
import { displayName } from "@/lib/input";
import { OAUTH_COOKIE, exchangeCode, fetchProfile, isProvider } from "@/lib/mail/oauth";
import { storeConnectedMailbox } from "@/lib/mail/connect";
type Pending = { state: string; verifier: string; provider: string; org: string; user?: string; link?: string; token?: string };
type LinkError = "expired" | "denied" | "used" | "refresh" | "failed";
const TOKEN_RE = /^[0-9a-f]{64}$/;
function redirectTo(path: string) {
  const res = NextResponse.redirect(new URL(path, publicEnv().NEXT_PUBLIC_APP_URL));
  res.cookies.set(OAUTH_COOKIE, "", { path: "/app/mailboxes/connect", maxAge: 0 });
  return res;
}
const done = (query: string) => redirectTo("/app/mailboxes?" + query);
const fail = (message: string) => done("error=" + encodeURIComponent(message));
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  let pending: Pending;
  try {
    pending = JSON.parse(open(req.cookies.get(OAUTH_COOKIE)?.value ?? "")) as Pending;
  } catch {
    return fail("The connect session expired. Start again.");
  }
  const token = pending.link && pending.token && TOKEN_RE.test(pending.token) ? pending.token : null;
  if (pending.link && token) return linkFlow(req, provider, pending, pending.link, token);
  if (!isProvider(provider) || !oauthProviders()[provider]) return fail("That provider is not configured on this instance.");
  const q = req.nextUrl.searchParams;
  if (pending.provider !== provider || !q.get("state") || q.get("state") !== pending.state) return fail("The connect session did not match. Start again.");
  const code = q.get("code");
  if (q.get("error") || !code) return fail("The provider did not grant access.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !pending.user || auth.user.id !== pending.user) return fail("Sign in again and retry.");
  const { data: allowed } = await supabase.rpc("has_org_role", { org: pending.org, roles: ["owner", "admin"] });
  if (allowed !== true) return fail("Only owners and admins can connect mailboxes.");
  try {
    const tokens = await exchangeCode(provider, code, pending.verifier);
    if (!tokens.refresh_token) return fail("The provider returned no refresh token. Remove the app from the account's connected apps and retry.");
    const profile = await fetchProfile(provider, tokens.access_token);
    await storeConnectedMailbox(createAdminClient(), {
      orgId: pending.org,
      provider,
      tokens: { ...tokens, refresh_token: tokens.refresh_token },
      profile,
      fromName: profile.name ?? "",
      createdBy: auth.user.id,
    });
    return done("message=" + encodeURIComponent(`Connected ${profile.email}.`));
  } catch {
    return fail("Could not connect the mailbox. Check the provider settings and try again.");
  }
}
// A client holding a connect link has no session; the link itself is checked and one use is taken before the mailbox is stored.
async function linkFlow(req: NextRequest, provider: string, pending: Pending, linkId: string, token: string) {
  const back = (error: LinkError) => redirectTo(`/connect/${token}?error=${error}`);
  if (!isProvider(provider) || !oauthProviders()[provider]) return back("failed");
  const q = req.nextUrl.searchParams;
  if (pending.provider !== provider || !q.get("state") || q.get("state") !== pending.state) return back("expired");
  const code = q.get("code");
  if (q.get("error") || !code) return back("denied");
  try {
    const admin = createAdminClient();
    const { data: rows, error: lookupError } = await admin.rpc("connect_link_lookup", { p_token: token });
    const link = rows?.[0];
    if (lookupError || !link || link.id !== linkId || link.organization_id !== pending.org) return back("used");
    const tokens = await exchangeCode(provider, code, pending.verifier);
    if (!tokens.refresh_token) return back("refresh");
    const profile = await fetchProfile(provider, tokens.access_token);
    const { data: consumed, error: consumeError } = await admin.rpc("consume_connect_link", { p_id: link.id });
    if (consumeError || consumed !== true) return back("used");
    await storeConnectedMailbox(admin, {
      orgId: link.organization_id,
      provider,
      tokens: { ...tokens, refresh_token: tokens.refresh_token },
      profile,
      fromName: displayName(profile.name ?? "", "", 200),
      createdBy: link.created_by,
    });
    return redirectTo(`/connect/${token}?done=1`);
  } catch {
    return back("failed");
  }
}
