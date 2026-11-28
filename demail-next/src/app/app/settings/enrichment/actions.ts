"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { cleanText } from "@/lib/input";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSeal, sealFor } from "@/lib/crypto/secretbox";
import { checkBaseUrl } from "@/lib/ai/shared";

const PATH = "/app/settings/enrichment";
const MAX_PROVIDERS = 10;
const fail = (message: string): never => redirect(`${PATH}?error=${encodeURIComponent(message)}`);
const done = (message: string): never => {
  revalidatePath(PATH);
  return redirect(`${PATH}?msg=${encodeURIComponent(message)}`);
};
async function manager() {
  const ctx = await getOrgContext();
  if (!ctx.canManage) return fail("Only owners and admins can change enrichment settings.");
  return ctx;
}
const uuid = z.string().uuid();
const KINDS = { enrich: ["hunter", "apollo", "http"], verify: ["millionverifier", "http"] } as const;
const DEFAULT_LABEL: Record<string, string> = { hunter: "Hunter", apollo: "Apollo", millionverifier: "MillionVerifier", http: "Custom" };

export async function saveEnrichmentSettings(formData: FormData) {
  const { supabase, org } = await manager();
  const parsed = z.object({ enabled: z.boolean(), daily_call_limit: z.coerce.number().int().min(1).max(5000) }).safeParse({
    enabled: formData.get("enabled") === "on",
    daily_call_limit: formData.get("daily_call_limit"),
  });
  if (!parsed.success) return fail("The daily call cap must be 1 to 5000.");
  const { error } = await supabase.from("enrichment_settings").upsert({ organization_id: org.id, ...parsed.data });
  if (error) return fail("Could not save the settings.");
  return done("Settings saved.");
}

export async function addProvider(formData: FormData) {
  const { supabase, org } = await manager();
  if (!canSeal()) return fail("Set MAILBOX_ENCRYPTION_KEY on the server to store a provider key.");
  const role = z.enum(["enrich", "verify"]).safeParse(formData.get("role"));
  if (!role.success) return fail("Pick a list.");
  const kind = String(formData.get("kind") ?? "");
  if (!(KINDS[role.data] as readonly string[]).includes(kind)) return fail("Pick a provider type from the list.");
  const key = String(formData.get("api_key") ?? "").trim();
  if (key.length < 8 || key.length > 500 || /\s/.test(key)) return fail("Paste the whole API key: 8 to 500 characters with no spaces.");
  let baseUrl: string | null = null;
  if (kind === "http") {
    const checked = checkBaseUrl(String(formData.get("base_url") ?? ""));
    if (!checked.ok) return fail(checked.message);
    baseUrl = checked.url;
  }
  const label = cleanText(formData.get("label"), 60) || DEFAULT_LABEL[kind];
  const { count } = await supabase.from("enrichment_providers").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("role", role.data);
  if ((count ?? 0) >= MAX_PROVIDERS) return fail(`A list holds at most ${MAX_PROVIDERS} providers.`);
  const { data: row, error } = await supabase
    .from("enrichment_providers")
    .insert({ organization_id: org.id, role: role.data, kind: kind as "hunter", label, base_url: baseUrl, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !row) return fail("Could not add the provider.");
  const { error: keyError } = await createAdminClient()
    .from("enrichment_credentials")
    .insert({ provider_id: row.id, organization_id: org.id, ciphertext: sealFor("enrichment-key", key), key_hint: key.slice(-4) });
  if (keyError) {
    await supabase.from("enrichment_providers").delete().eq("id", row.id).eq("organization_id", org.id);
    return fail("Could not store the provider key.");
  }
  return done("Provider added.");
}

export async function removeProvider(id: string) {
  const { supabase, org } = await manager();
  if (!uuid.safeParse(id).success) return fail("Unknown provider.");
  const { error } = await supabase.from("enrichment_providers").delete().eq("id", id).eq("organization_id", org.id);
  if (error) return fail("Could not remove the provider.");
  return done("Provider removed.");
}

export async function toggleProvider(id: string) {
  const { supabase, org } = await manager();
  if (!uuid.safeParse(id).success) return fail("Unknown provider.");
  const { data } = await supabase.from("enrichment_providers").select("enabled").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!data) return fail("Unknown provider.");
  const { error } = await supabase.from("enrichment_providers").update({ enabled: !data.enabled }).eq("id", id).eq("organization_id", org.id);
  if (error) return fail("Could not update the provider.");
  return done(data.enabled ? "Provider turned off." : "Provider turned on.");
}

// Rewrites positions 0..n after moving one provider a step within its list.
export async function moveProvider(id: string, direction: "up" | "down") {
  const { supabase, org } = await manager();
  if (!uuid.safeParse(id).success) return fail("Unknown provider.");
  const { data: me } = await supabase.from("enrichment_providers").select("role").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!me) return fail("Unknown provider.");
  const { data: list } = await supabase.from("enrichment_providers").select("id").eq("organization_id", org.id).eq("role", me.role).order("position").order("created_at");
  const order = (list ?? []).map((p) => p.id);
  const i = order.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return done("Order unchanged.");
  [order[i], order[j]] = [order[j], order[i]];
  for (const [position, pid] of order.entries()) {
    const { error } = await supabase.from("enrichment_providers").update({ position }).eq("id", pid).eq("organization_id", org.id);
    if (error) return fail("Could not change the order.");
  }
  return done("Order saved.");
}
