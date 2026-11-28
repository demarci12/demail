import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { formsEnv, serverEnv } from "@/lib/env";
import { ipPrefix } from "@/lib/input";
const MIN_AGE_MS = 3_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
function formKey() {
  return createHmac("sha256", serverEnv().UNSUBSCRIBE_SECRET).update("demail:forms:v1").digest();
}
function hmac(payload: string) {
  return createHmac("sha256", formKey()).update(payload).digest();
}
// Fill-time token: <render time ms>.<base64url hmac of form id and time>.
export function signFillToken(formId: string, now = Date.now()) {
  return `${now}.${hmac(`t:${formId}:${now}`).toString("base64url")}`;
}
export function verifyFillToken(formId: string, token: string | null, now = Date.now()): boolean {
  if (!token || token.length > 100) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d{1,16}$/.test(parts[0])) return false;
  const issued = Number(parts[0]);
  const expected = Buffer.from(hmac(`t:${formId}:${parts[0]}`).toString("base64url"));
  const got = Buffer.from(parts[1]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
  const age = now - issued;
  return age >= MIN_AGE_MS && age <= MAX_AGE_MS;
}
// Keyed hash of form, address prefix and UTC day, so no IP address is stored.
export function rateBucket(formId: string, ip: string | null, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return hmac(`b:${formId}:${ipPrefix(ip)}:${day}`).toString("hex").slice(0, 32);
}
// Only proxy-written headers name the client: unset reads X-Real-IP, 0 trusts no header, N reads the Nth X-Forwarded-For entry from the right.
export function clientIp(req: Request): string | null {
  const hops = formsEnv().TRUSTED_PROXY_HOPS;
  if (hops === undefined) return req.headers.get("x-real-ip")?.trim() || null;
  if (hops === 0) return null;
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain.length >= hops ? chain[chain.length - hops] : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Double opt-in link token: <confirmation id>.<base64url hmac>; single use and expiry are enforced by confirm_form_optin.
export function signConfirmToken(confirmationId: string) {
  return `${confirmationId}.${hmac(`c:${confirmationId}`).toString("base64url")}`;
}
export function verifyConfirmToken(token: string): string | null {
  if (token.length > 100) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !UUID_RE.test(parts[0])) return null;
  const expected = Buffer.from(hmac(`c:${parts[0]}`).toString("base64url"));
  const got = Buffer.from(parts[1]);
  return expected.length === got.length && timingSafeEqual(expected, got) ? parts[0] : null;
}
