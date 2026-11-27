import "server-only";
import { hostMatches } from "@/lib/input";
import { createAdminClient } from "@/lib/supabase/admin";
import { signVisitMatch } from "./token";
// Adds a signed dm parameter when the click lands on a site tracked by the message's workspace; any failure keeps the link as is.
export async function addVisitMatch(messageId: string, target: URL): Promise<URL> {
  try {
    const admin = createAdminClient();
    const { data: message } = await admin.from("messages").select("organization_id").eq("id", messageId).maybeSingle();
    if (!message) return target;
    const { data: trackers, error } = await admin
      .from("site_trackers")
      .select("domains")
      .eq("organization_id", message.organization_id)
      .eq("enabled", true)
      .eq("identify_from_email", true);
    if (error || !trackers?.some((t) => hostMatches(target.hostname.toLowerCase(), t.domains))) return target;
    const out = new URL(target.toString());
    out.searchParams.set("dm", signVisitMatch(messageId));
    return out;
  } catch {
    return target;
  }
}
