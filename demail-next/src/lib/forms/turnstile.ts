import "server-only";
import { formsEnv } from "@/lib/env";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// Fails closed: a missing token, a non-2xx answer or any error counts as a failed check.
export async function verifyTurnstile(token: string | null, ip: string | null): Promise<boolean> {
  const secret = formsEnv().TURNSTILE_SECRET_KEY;
  if (!secret || !token || token.length > 4096) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: unknown };
    return json.success === true;
  } catch {
    return false;
  }
}
