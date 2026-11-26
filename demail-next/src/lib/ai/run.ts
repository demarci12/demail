import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { openFor } from "@/lib/crypto/secretbox";
import { aiEnv } from "@/lib/env";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "@/lib/ai/shared";
import { AiError, chatComplete, type AiConfig, type AiMessage, type AiOptions } from "@/lib/ai/provider";
type Admin = SupabaseClient<Database>;
export type ResolvedAi = AiConfig & { source: "workspace" | "instance" };
// Workspace key first, then the instance key; the instance key always uses the operator's base URL and model.
export async function resolveAi(admin: Admin, orgId: string): Promise<ResolvedAi> {
  const { data: settings, error } = await admin
    .from("ai_settings")
    .select("enabled, base_url, model")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new AiError("provider");
  if (!settings || !settings.enabled) throw new AiError("off");
  const env = aiEnv();
  const { data: cred, error: credError } = await admin.from("ai_credentials").select("ciphertext").eq("organization_id", orgId).maybeSingle();
  if (credError) throw new AiError("provider");
  if (cred) {
    let apiKey: string;
    try {
      apiKey = openFor("ai-key", cred.ciphertext);
    } catch {
      throw new AiError("no_key", "The stored AI key cannot be opened. Paste it again in Settings, AI.");
    }
    return {
      source: "workspace",
      apiKey,
      baseUrl: settings.base_url ?? DEFAULT_AI_BASE_URL,
      model: settings.model ?? env.AI_MODEL ?? DEFAULT_AI_MODEL,
      checkHost: true,
    };
  }
  if (env.AI_API_KEY) {
    return {
      source: "instance",
      apiKey: env.AI_API_KEY,
      baseUrl: (env.AI_BASE_URL ?? DEFAULT_AI_BASE_URL).replace(/\/+$/, ""),
      model: env.AI_MODEL ?? DEFAULT_AI_MODEL,
      checkHost: false,
    };
  }
  throw new AiError("no_key");
}
// Reserves one call against the daily limits before the request, so failed calls still count.
export async function aiCall(admin: Admin, orgId: string, messages: AiMessage[], opts: AiOptions): Promise<string> {
  const ai = await resolveAi(admin, orgId);
  const { data: reserved, error } = await admin.rpc("reserve_ai_call", {
    p_org: orgId,
    p_source: ai.source,
    p_instance_limit: aiEnv().AI_INSTANCE_DAILY_CALL_CAP,
  });
  if (error) throw new AiError("provider");
  if (!reserved) throw new AiError("limit");
  const out = await chatComplete(ai, messages, opts);
  await admin.rpc("record_ai_tokens", { p_org: orgId, p_source: ai.source, p_prompt: out.promptTokens, p_completion: out.completionTokens });
  return out.text;
}
export function aiErrorMessage(e: unknown): string {
  return e instanceof AiError ? e.message : "The AI request failed.";
}
