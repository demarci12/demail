import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mailEnv, publicEnv } from "@/lib/env";
export type OAuthProvider = "google" | "microsoft";
export type TokenSet = { access_token: string; refresh_token: string | null; expires_at: number; scope: string | null };
export class OAuthError extends Error {
  constructor(
    message: string,
    readonly invalidGrant = false,
  ) {
    super(message);
  }
}
export const OAUTH_COOKIE = "demail_oauth";
export const isProvider = (v: string): v is OAuthProvider => v === "google" || v === "microsoft";
const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"];
const MICROSOFT_SCOPES = ["offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"];
export const redirectUri = (p: OAuthProvider) => `${publicEnv().NEXT_PUBLIC_APP_URL}/app/mailboxes/connect/${p}/callback`;
function config(p: OAuthProvider) {
  const e = mailEnv();
  if (p === "google") {
    return {
      clientId: e.GOOGLE_CLIENT_ID ?? "",
      clientSecret: e.GOOGLE_CLIENT_SECRET ?? "",
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      scopes: GOOGLE_SCOPES,
    };
  }
  const base = `https://login.microsoftonline.com/${encodeURIComponent(e.MICROSOFT_TENANT)}/oauth2/v2.0`;
  return {
    clientId: e.MICROSOFT_CLIENT_ID ?? "",
    clientSecret: e.MICROSOFT_CLIENT_SECRET ?? "",
    authorize: `${base}/authorize`,
    token: `${base}/token`,
    scopes: MICROSOFT_SCOPES,
  };
}
export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
export function authorizeUrl(p: OAuthProvider, state: string, challenge: string, loginHint?: string) {
  const c = config(p);
  const url = new URL(c.authorize);
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("redirect_uri", redirectUri(p));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", c.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  if (p === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  } else {
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}
// Provider error bodies are never surfaced: they can echo credentials.
async function tokenRequest(p: OAuthProvider, params: Record<string, string>): Promise<TokenSet> {
  const c = config(p);
  const res = await fetch(c.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    throw new OAuthError(`Token request failed (${res.status})`, json.error === "invalid_grant");
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expires_at: Date.now() + expiresIn * 1000,
    scope: typeof json.scope === "string" ? json.scope : null,
  };
}
export const exchangeCode = (p: OAuthProvider, code: string, verifier: string) =>
  tokenRequest(p, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri(p) });
export const refreshTokens = (p: OAuthProvider, refreshToken: string) =>
  tokenRequest(p, { grant_type: "refresh_token", refresh_token: refreshToken });
export async function fetchProfile(p: OAuthProvider, accessToken: string): Promise<{ email: string; accountId: string | null; name: string | null }> {
  const url = p === "google" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName";
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new OAuthError(`Profile request failed (${res.status})`);
  const j = (await res.json()) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const email = p === "google" ? str(j.email) : (str(j.mail) ?? str(j.userPrincipalName));
  if (!email) throw new OAuthError("The account has no email address");
  return { email: email.toLowerCase(), accountId: p === "google" ? str(j.sub) : str(j.id), name: p === "google" ? str(j.name) : str(j.displayName) };
}
// Best effort: a failed revoke never blocks removing the mailbox.
export async function revokeGoogle(token: string) {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      cache: "no-store",
    });
  } catch {
    // Ignored on purpose.
  }
}
