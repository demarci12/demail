import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org";
import { oauthProviders, publicEnv } from "@/lib/env";
import { seal } from "@/lib/crypto/secretbox";
import { OAUTH_COOKIE, authorizeUrl, isProvider, newPkce } from "@/lib/mail/oauth";
const back = (message: string) => NextResponse.redirect(new URL("/app/mailboxes?error=" + encodeURIComponent(message), publicEnv().NEXT_PUBLIC_APP_URL));
export async function GET(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const { user, org, canManage } = await getOrgContext();
  if (!isProvider(provider) || !oauthProviders()[provider]) return back("That provider is not configured on this instance.");
  if (!canManage) return back("Only owners and admins can connect mailboxes.");
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = newPkce();
  const res = NextResponse.redirect(authorizeUrl(provider, state, challenge));
  res.cookies.set(OAUTH_COOKIE, seal(JSON.stringify({ state, verifier, provider, org: org.id, user: user.id })), {
    httpOnly: true,
    sameSite: "lax",
    secure: publicEnv().NEXT_PUBLIC_APP_URL.startsWith("https://"),
    path: "/app/mailboxes/connect",
    maxAge: 600,
  });
  return res;
}
