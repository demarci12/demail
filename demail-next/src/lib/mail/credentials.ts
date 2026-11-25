import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { open, seal } from "@/lib/crypto/secretbox";
import { OAuthError, refreshTokens, type OAuthProvider, type TokenSet } from "@/lib/mail/oauth";
type Admin = SupabaseClient<Database>;
type Stored = { access_token: string; refresh_token: string; expires_at: number };
export class MailAuthError extends Error {
  constructor(message = "Reconnect this mailbox") {
    super(message);
  }
}
export async function saveCredentials(admin: Admin, mailbox: { id: string; organization_id: string }, tokens: TokenSet & { refresh_token: string }) {
  const payload: Stored = { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at };
  const { error } = await admin.from("mailbox_credentials").upsert({
    mailbox_id: mailbox.id,
    organization_id: mailbox.organization_id,
    ciphertext: seal(JSON.stringify(payload)),
    scopes: tokens.scope,
    expires_at: new Date(tokens.expires_at).toISOString(),
    version: 1,
  });
  if (error) throw new Error("Could not store mailbox credentials");
}
async function read(admin: Admin, mailboxId: string, orgId: string) {
  const { data } = await admin.from("mailbox_credentials").select("ciphertext, version").eq("mailbox_id", mailboxId).eq("organization_id", orgId).maybeSingle();
  if (!data) throw new MailAuthError();
  return { stored: JSON.parse(open(data.ciphertext)) as Stored, version: data.version };
}
// Returns a valid access token, refreshing lazily with a compare-and-set on `version`.
export async function getAccessToken(admin: Admin, mailboxId: string, orgId: string, provider: OAuthProvider): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { stored, version } = await read(admin, mailboxId, orgId);
    if (stored.expires_at - Date.now() > 60_000) return stored.access_token;
    let fresh: TokenSet;
    try {
      fresh = await refreshTokens(provider, stored.refresh_token);
    } catch (e) {
      if (e instanceof OAuthError && e.invalidGrant) {
        await admin.from("mailboxes").update({ status: "disconnected", last_error: "Reconnect this mailbox" }).eq("id", mailboxId).eq("organization_id", orgId);
        throw new MailAuthError();
      }
      throw e;
    }
    const next: Stored = { access_token: fresh.access_token, refresh_token: fresh.refresh_token ?? stored.refresh_token, expires_at: fresh.expires_at };
    const { data } = await admin
      .from("mailbox_credentials")
      .update({ ciphertext: seal(JSON.stringify(next)), expires_at: new Date(next.expires_at).toISOString(), version: version + 1 })
      .eq("mailbox_id", mailboxId)
      .eq("organization_id", orgId)
      .eq("version", version)
      .select("mailbox_id");
    if (data && data.length > 0) return next.access_token;
  }
  throw new Error("Could not refresh mailbox credentials");
}
export async function readRefreshToken(admin: Admin, mailboxId: string, orgId: string): Promise<string | null> {
  try {
    return (await read(admin, mailboxId, orgId)).stored.refresh_token;
  } catch {
    return null;
  }
}
