import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { saveCredentials } from "@/lib/mail/credentials";
import type { OAuthProvider, TokenSet } from "@/lib/mail/oauth";
type Admin = SupabaseClient<Database>;
type Profile = { email: string; accountId: string | null; name: string | null };
// Finds or inserts the mailbox by (organization_id, email), stores its credentials and schedules a sync; throws on failure.
export async function storeConnectedMailbox(
  admin: Admin,
  { orgId, provider, tokens, profile, fromName, createdBy }: { orgId: string; provider: OAuthProvider; tokens: TokenSet & { refresh_token: string }; profile: Profile; fromName: string; createdBy: string | null },
): Promise<string> {
  const fields = { provider, provider_account_id: profile.accountId, status: "active" as const, last_error: null };
  const { data: existing } = await admin.from("mailboxes").select("id").eq("organization_id", orgId).eq("email", profile.email).maybeSingle();
  let mailboxId = existing?.id;
  if (mailboxId) {
    const { error } = await admin.from("mailboxes").update(fields).eq("id", mailboxId).eq("organization_id", orgId);
    if (error) throw new Error("update failed");
  } else {
    const { data, error } = await admin
      .from("mailboxes")
      .insert({ ...fields, organization_id: orgId, email: profile.email, from_name: fromName, created_by: createdBy })
      .select("id")
      .single();
    if (error || !data) throw new Error("insert failed");
    mailboxId = data.id;
  }
  await saveCredentials(admin, { id: mailboxId, organization_id: orgId }, tokens);
  // An existing cursor is kept so replies that arrived while disconnected are still read.
  const { data: prior } = await admin.from("mailbox_sync_state").select("cursor").eq("mailbox_id", mailboxId).eq("organization_id", orgId).maybeSingle();
  const { error: syncError } = await admin
    .from("mailbox_sync_state")
    .upsert({ mailbox_id: mailboxId, organization_id: orgId, cursor: prior?.cursor ?? null, next_sync_at: new Date().toISOString(), consecutive_errors: 0 });
  if (syncError) throw new Error("sync state failed");
  return mailboxId;
}
