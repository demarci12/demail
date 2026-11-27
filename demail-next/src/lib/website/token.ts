import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { ipPrefix } from "@/lib/input";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_AGE_MS = 60 * 60 * 1000;
const MAX_SKEW_MS = 60 * 1000;
function websiteKey() {
  return createHmac("sha256", serverEnv().UNSUBSCRIBE_SECRET).update("demail:website:v1").digest();
}
function hmac(payload: string) {
  return createHmac("sha256", websiteKey()).update(payload).digest();
}
// Visit match token appended to counted email clicks: <message id>.<issued ms>.<base64url hmac>.
export function signVisitMatch(messageId: string, now = Date.now()) {
  return `${messageId}.${now}.${hmac(`m:${messageId}:${now}`).toString("base64url")}`;
}
// Message id of a valid token issued within the last hour, else null.
export function verifyVisitMatch(token: unknown, now = Date.now()): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !UUID.test(parts[0]) || !/^\d{1,16}$/.test(parts[1])) return null;
  const expected = Buffer.from(hmac(`m:${parts[0]}:${parts[1]}`).toString("base64url"));
  const got = Buffer.from(parts[2]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  const age = now - Number(parts[1]);
  return age >= -MAX_SKEW_MS && age <= MAX_AGE_MS ? parts[0] : null;
}
// Keyed hash of tracker key, address prefix and UTC day, so no IP address is stored.
export function siteBucket(trackerKey: string, ip: string | null, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return hmac(`b:${trackerKey}:${ipPrefix(ip)}:${day}`).toString("hex").slice(0, 32);
}
