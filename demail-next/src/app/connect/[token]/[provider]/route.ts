import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { oauthProviders, publicEnv } from "@/lib/env";
import { seal } from "@/lib/crypto/secretbox";
import { OAUTH_COOKIE, authorizeUrl, isProvider, newPkce } from "@/lib/mail/oauth";
const TOKEN_RE = /^[0-9a-f]{64}$/;
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; provider: string }> }) {
  const { token, provider } = await params;
  const back = (error: string) => NextResponse.redirect(new URL(`/connect/${encodeURIComponent(token)}?error=${error}`, publicEnv().NEXT_PUBLIC_APP_URL));
  if (!TOKEN_RE.test(token) || !isProvider(provider) || !oauthProviders()[provider]) return back("failed");
  const { data: rows } = await createAdminClient().rpc("connect_link_lookup", { p_token: token });
  const link = rows?.[0];
  if (!link) return back("used");
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = newPkce();
  const res = NextResponse.redirect(authorizeUrl(provider, state, challenge));
  res.cookies.set(OAUTH_COOKIE, seal(JSON.stringify({ state, verifier, provider, org: link.organization_id, link: link.id, token })), {
    httpOnly: true,
    sameSite: "lax",
    secure: publicEnv().NEXT_PUBLIC_APP_URL.startsWith("https://"),
    path: "/app/mailboxes/connect",
    maxAge: 600,
  });
  return res;
}
