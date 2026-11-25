import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
// Suppresses the contact's address, unsubscribes the contact and stops its active enrollments.
export async function applyUnsubscribe(token: string): Promise<boolean> {
  const parsed = verifyUnsubscribe(token);
  if (!parsed) return false;
  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, email")
    .eq("id", parsed.contactId)
    .eq("organization_id", parsed.orgId)
    .maybeSingle();
  if (!contact) return false;
  const { data: existing } = await admin
    .from("suppressed_recipients")
    .select("id")
    .eq("organization_id", parsed.orgId)
    .ilike("email", contact.email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (!existing) {
    await admin.from("suppressed_recipients").insert({ organization_id: parsed.orgId, email: contact.email.toLowerCase(), source: "unsubscribe" });
  }
  await admin.from("contacts").update({ subscribed: false }).eq("id", contact.id).eq("organization_id", parsed.orgId);
  await admin
    .from("campaign_contacts")
    .update({ status: "stopped", next_send_at: null, error: "Unsubscribed" })
    .eq("contact_id", contact.id)
    .eq("organization_id", parsed.orgId)
    .eq("status", "active");
  return true;
}
