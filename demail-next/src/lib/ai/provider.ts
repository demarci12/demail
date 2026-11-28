import "server-only";
import { lookup } from "node:dns/promises";
import { checkBaseUrl, isPrivateAddress } from "@/lib/ai/shared";
export type AiErrorCode = "off" | "no_key" | "limit" | "auth" | "rate" | "provider" | "bad_output" | "url";
const MESSAGES: Record<AiErrorCode, string> = {
  off: "AI is off for this workspace. An owner or admin can turn it on in Settings, AI.",
  no_key: "No AI key is set. Add one in Settings, AI.",
  limit: "An AI limit for this workspace is reached: its daily limit or a monthly limit set by its agency.",
  auth: "The AI provider refused the key.",
  rate: "The AI provider is rate limiting. Try again shortly.",
  provider: "The AI provider did not answer. Try again shortly.",
  bad_output: "The AI provider returned something unusable. Try again.",
  url: "The AI base URL is not allowed.",
};
// Carries only fixed, user-safe sentences; never a key, a request or a provider response.
export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = "AiError";
    this.code = code;
  }
}
export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiConfig = { baseUrl: string; apiKey: string; model: string; checkHost: boolean };
export type AiOptions = { maxTokens: number; temperature: number };
const MAX_RESPONSE_CHARS = 500_000;
export async function assertPublicHost(baseUrl: string): Promise<string> {
  const checked = checkBaseUrl(baseUrl);
  if (!checked.ok) throw new AiError("url");
  const host = new URL(checked.url).hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new AiError("url");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new AiError("url");
  return checked.url;
}
// One OpenAI-compatible chat completions call.
export async function chatComplete(
  cfg: AiConfig,
  messages: AiMessage[],
  opts: AiOptions,
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const base = cfg.checkHost ? await assertPublicHost(cfg.baseUrl) : cfg.baseUrl.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature }),
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch {
    throw new AiError("provider");
  }
  if (res.status === 401 || res.status === 403) throw new AiError("auth");
  if (res.status === 429) throw new AiError("rate");
  if (!res.ok) throw new AiError("provider");
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new AiError("provider");
  }
  if (text.length > MAX_RESPONSE_CHARS) throw new AiError("provider");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AiError("bad_output");
  }
  const data = body as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") throw new AiError("bad_output");
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { text: content, promptTokens: count(data?.usage?.prompt_tokens), completionTokens: count(data?.usage?.completion_tokens) };
}
