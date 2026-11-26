"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSeal, sealFor } from "@/lib/crypto/secretbox";
import { CrmError, checkToken, portalId } from "@/lib/crm/hubspot";
import { crmBackoffMs, runCrmTick } from "@/lib/crm/run";
const PATH = "/app/settings/crm";
const PROVIDER = "hubspot" as const;
const fail = (message: string): never => redirect(`${PATH}?error=${encodeURIComponent(message)}`);
const done = (message: string): never => {
  revalidatePath(PATH);
  return redirect(`${PATH}?msg=${encodeURIComponent(message)}`);
};
async function manager() {
  const ctx = await getOrgContext();
  if (!ctx.canManage) return fail("Only owners and admins can change the HubSpot connection.");
  return ctx;
}
export async function connectHubSpot(formData: FormData) {
  const { org } = await manager();
  if (!canSeal()) return fail("Set MAILBOX_ENCRYPTION_KEY on the server to store a HubSpot token.");
  const token = String(formData.get("token") ?? "").trim();
  if (token.length < 10 || token.length > 500 || /\s/.test(token)) return fail("Paste the whole private app token: 10 to 500 characters with no spaces.");
  let problem: string | null = null;
  try {
    await checkToken(token);
  } catch (e) {
    problem = e instanceof CrmError ? e.message : "HubSpot did not answer. Try again.";
  }
  if (problem) return fail(problem);
  const portal = await portalId(token);
  const admin = createAdminClient();
  const { data: existing } = await admin.from("crm_connections").select("portal_id").eq("organization_id", org.id).eq("provider", PROVIDER).maybeSingle();
  // A token for another HubSpot account starts over: old links point at records that do not exist there.
  const otherPortal = !!existing && portal !== null && existing.portal_id !== portal;
  if (otherPortal) {
    const { error } = await admin.from("crm_contact_links").delete().eq("organization_id", org.id).eq("provider", PROVIDER);
    if (error) return fail("Could not reset the HubSpot links.");
  }
  const { error: connError } = await admin.from("crm_connections").upsert({
    organization_id: org.id,
    provider: PROVIDER,
    portal_id: portal ?? existing?.portal_id ?? null,
    enabled: true,
    next_sync_at: new Date().toISOString(),
    last_error: null,
    consecutive_errors: 0,
    ...(otherPortal ? { pull_cursor: null } : {}),
  });
  if (connError) return fail("Could not save the HubSpot connection.");
  const { error: credError } = await admin
    .from("crm_credentials")
    .upsert({ organization_id: org.id, provider: PROVIDER, ciphertext: sealFor("crm-token", token), key_hint: token.slice(-4) });
  if (credError) return fail("Could not store the HubSpot token.");
  return done("HubSpot connected. The first sync starts within 5 minutes.");
}
const uuid = z.string().uuid();
export async function saveCrmOptions(formData: FormData) {
  const { supabase, org } = await manager();
  const rawLabel = String(formData.get("label_id") ?? "");
  let labelId: string | null = null;
  if (rawLabel) {
    if (!uuid.safeParse(rawLabel).success) return fail("Pick a label from the list.");
    const { data: label } = await supabase.from("labels").select("id").eq("id", rawLabel).eq("organization_id", org.id).maybeSingle();
    if (!label) return fail("Pick a label from the list.");
    labelId = label.id;
  }
  const { data, error } = await createAdminClient()
    .from("crm_connections")
    .update({
      enabled: formData.get("enabled") === "on",
      pull_contacts: formData.get("pull_contacts") === "on",
      push_replies: formData.get("push_replies") === "on",
      label_id: labelId,
    })
    .eq("organization_id", org.id)
    .eq("provider", PROVIDER)
    .select("organization_id");
  if (error) return fail("Could not save the HubSpot options.");
  if (!data || data.length === 0) return fail("Connect HubSpot first.");
  return done("HubSpot options saved.");
}
export async function syncCrmNow() {
  const { supabase, org } = await getOrgContext();
  const { data: conn } = await supabase
    .from("crm_connections")
    .select("enabled, last_synced_at, consecutive_errors, next_sync_at")
    .eq("organization_id", org.id)
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (!conn) return fail("Connect HubSpot first.");
  if (!conn.enabled) return fail("HubSpot sync is turned off.");
  // A failed run sets next_sync_at to its own time plus the backoff, so that is when it was tried.
  const lastTry = conn.consecutive_errors > 0 ? new Date(conn.next_sync_at).getTime() - crmBackoffMs(conn.consecutive_errors) : conn.last_synced_at ? new Date(conn.last_synced_at).getTime() : null;
  if (lastTry !== null && Date.now() - lastTry < 60_000) return fail(conn.consecutive_errors > 0 ? "Tried a moment ago. Try again in a minute." : "Synced a moment ago. Try again in a minute.");
  const admin = createAdminClient();
  const { error } = await admin.from("crm_connections").update({ next_sync_at: new Date().toISOString() }).eq("organization_id", org.id).eq("provider", PROVIDER);
  if (error) return fail("Could not start the sync.");
  let result: Awaited<ReturnType<typeof runCrmTick>> | null = null;
  try {
    result = await runCrmTick({ organizationId: org.id });
  } catch {
    result = null;
  }
  revalidatePath(PATH);
  if (!result) return fail("Could not run the sync.");
  if (result.claimed === 0) return fail("A sync is already running. Try again in a few minutes.");
  if (result.failed > 0) {
    const { data: after } = await admin.from("crm_connections").select("last_error").eq("organization_id", org.id).eq("provider", PROVIDER).maybeSingle();
    return fail(after?.last_error ?? "Sync failed, retrying");
  }
  const resolved = result.resolved > 0 ? ` ${result.resolved} skipped replies were added on retry.` : "";
  const skipped = result.skipped > 0 ? ` ${result.skipped} replies were skipped because HubSpot refused the contact.` : "";
  return done(`Synced: ${result.pulled} HubSpot contacts read, ${result.created} created here, ${result.pushed} replies added as notes.${resolved}${skipped}`);
}
export async function retrySkippedReplies() {
  const { org } = await manager();
  const admin = createAdminClient();
  const { data: conn } = await admin.from("crm_connections").select("enabled, push_replies").eq("organization_id", org.id).eq("provider", PROVIDER).maybeSingle();
  if (!conn?.enabled || !conn.push_replies) return fail("Turn on Enabled and Push replies under Options to retry skipped replies.");
  const { data, error } = await admin
    .from("crm_push_skips")
    .update({ retry_requested: true })
    .eq("organization_id", org.id)
    .eq("provider", PROVIDER)
    .select("message_id");
  if (error) return fail("Could not mark the skipped replies for a retry.");
  if (!data || data.length === 0) return fail("Nothing to retry.");
  const { error: connError } = await admin.from("crm_connections").update({ next_sync_at: new Date().toISOString() }).eq("organization_id", org.id).eq("provider", PROVIDER);
  if (connError) return fail("Could not schedule the retry.");
  return done("Skipped replies will be retried with the next sync, within 5 minutes.");
}
export async function dismissSkippedReplies() {
  const { org } = await manager();
  const { error } = await createAdminClient().from("crm_push_skips").delete().eq("organization_id", org.id).eq("provider", PROVIDER);
  if (error) return fail("Could not dismiss the skipped replies.");
  return done("Skipped replies dismissed. They stay out of HubSpot.");
}
export async function disconnectCrm() {
  const { org } = await manager();
  const admin = createAdminClient();
  const { error: linkError } = await admin.from("crm_contact_links").delete().eq("organization_id", org.id).eq("provider", PROVIDER);
  if (linkError) return fail("Could not remove the HubSpot links.");
  const { error } = await admin.from("crm_connections").delete().eq("organization_id", org.id).eq("provider", PROVIDER);
  if (error) return fail("Could not disconnect HubSpot.");
  return done("HubSpot disconnected. The token and contact links were removed; your contacts stay.");
}
