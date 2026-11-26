"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSeal, sealFor } from "@/lib/crypto/secretbox";
import { checkBaseUrl } from "@/lib/ai/shared";
import { aiCall, aiErrorMessage } from "@/lib/ai/run";
const PATH = "/app/settings/ai";
const fail = (message: string): never => redirect(`${PATH}?error=${encodeURIComponent(message)}`);
const done = (message: string): never => {
  revalidatePath(PATH);
  return redirect(`${PATH}?msg=${encodeURIComponent(message)}`);
};
async function manager() {
  const ctx = await getOrgContext();
  if (!ctx.canManage) return fail("Only owners and admins can change AI settings.");
  return ctx;
}
const settingsSchema = z.object({
  enabled: z.boolean(),
  classify_replies: z.boolean(),
  base_url: z.string().trim().max(300),
  model: z.string().trim().max(100),
  daily_call_limit: z.coerce.number().int().min(1).max(5000),
});
export async function saveAiSettings(formData: FormData) {
  const { supabase, org } = await manager();
  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    classify_replies: formData.get("classify_replies") === "on",
    base_url: formData.get("base_url") ?? "",
    model: formData.get("model") ?? "",
    daily_call_limit: formData.get("daily_call_limit"),
  });
  if (!parsed.success) return fail("Check the fields: the model is at most 100 characters and the daily call limit is 1 to 5000.");
  let baseUrl: string | null = null;
  if (parsed.data.base_url) {
    const checked = checkBaseUrl(parsed.data.base_url);
    if (!checked.ok) return fail(checked.message);
    baseUrl = checked.url;
  }
  const { data: current } = await supabase
    .from("ai_settings")
    .select("classify_replies, classify_enabled_at")
    .eq("organization_id", org.id)
    .maybeSingle();
  const classify = parsed.data.classify_replies;
  // Classification only reads replies that arrive after it was switched on.
  const classifyEnabledAt = !classify
    ? null
    : !current || !current.classify_replies
      ? new Date().toISOString()
      : (current.classify_enabled_at ?? new Date().toISOString());
  const { error } = await supabase.from("ai_settings").upsert({
    organization_id: org.id,
    enabled: parsed.data.enabled,
    classify_replies: classify,
    classify_enabled_at: classifyEnabledAt,
    base_url: baseUrl,
    model: parsed.data.model || null,
    daily_call_limit: parsed.data.daily_call_limit,
  });
  if (error) return fail("Could not save the AI settings.");
  return done("AI settings saved.");
}
export async function saveAiKey(formData: FormData) {
  const { org } = await manager();
  if (!canSeal()) return fail("Set MAILBOX_ENCRYPTION_KEY on the server to store a workspace key.");
  const key = String(formData.get("api_key") ?? "").trim();
  if (key.length < 8 || key.length > 500 || /\s/.test(key)) return fail("Paste the whole API key: 8 to 500 characters with no spaces.");
  const { error } = await createAdminClient()
    .from("ai_credentials")
    .upsert({ organization_id: org.id, ciphertext: sealFor("ai-key", key), key_hint: key.slice(-4) });
  if (error) return fail("Could not store the AI key.");
  return done("AI key saved.");
}
export async function removeAiKey() {
  const { org } = await manager();
  const { error } = await createAdminClient().from("ai_credentials").delete().eq("organization_id", org.id);
  if (error) return fail("Could not remove the AI key.");
  return done("AI key removed.");
}
export async function testAi() {
  const { org } = await manager();
  let message: string | null = null;
  try {
    await aiCall(createAdminClient(), org.id, [{ role: "user", content: "Reply with the single word ready." }], { maxTokens: 5, temperature: 0 });
  } catch (e) {
    message = aiErrorMessage(e);
  }
  revalidatePath(PATH);
  if (message) return fail(message);
  return done("The AI provider answered.");
}
