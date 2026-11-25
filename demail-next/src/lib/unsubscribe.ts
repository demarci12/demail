import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function mac(payload: string) {
  return createHmac("sha256", serverEnv().UNSUBSCRIBE_SECRET).update(payload).digest("base64url");
}
// Token layout: <org id>.<contact id>.<hmac>, valid until UNSUBSCRIBE_SECRET changes.
export function signUnsubscribe(orgId: string, contactId: string) {
  const payload = `${orgId}.${contactId}`;
  return `${payload}.${mac(payload)}`;
}
export function verifyUnsubscribe(token: string): { orgId: string; contactId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [orgId, contactId, sig] = parts;
  if (!UUID.test(orgId) || !UUID.test(contactId)) return null;
  const expected = Buffer.from(mac(`${orgId}.${contactId}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { orgId, contactId };
}
export function unsubscribeUrl(baseUrl: string, orgId: string, contactId: string) {
  return `${baseUrl.replace(/\/$/, "")}/unsubscribe/${signUnsubscribe(orgId, contactId)}`;
}
