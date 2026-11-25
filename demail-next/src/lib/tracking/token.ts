import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { publicEnv, serverEnv } from "@/lib/env";
import { readerMarker } from "./reader";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function trackingKey() {
  return createHmac("sha256", serverEnv().UNSUBSCRIBE_SECRET).update("demail:tracking:v1").digest();
}
function mac(payload: string) {
  return createHmac("sha256", trackingKey()).update(payload).digest("base64url");
}
function same(given: string, payload: string) {
  const expected = Buffer.from(mac(payload));
  const got = Buffer.from(given);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
// Open token: <message id>.<hmac>. Click token: <message id>.<base64url url>.<hmac>.
export function signOpen(messageId: string) {
  return `${messageId}.${mac(`o:${messageId}`)}`;
}
export function verifyOpen(token: string): { messageId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !UUID.test(parts[0]) || !same(parts[1], `o:${parts[0]}`)) return null;
  return { messageId: parts[0] };
}
export function signClick(messageId: string, url: string) {
  const payload = `${messageId}.${Buffer.from(url, "utf8").toString("base64url")}`;
  return `${payload}.${mac(`c:${payload}`)}`;
}
export function verifyClick(token: string): { messageId: string; url: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !UUID.test(parts[0]) || !same(parts[2], `c:${parts[0]}.${parts[1]}`)) return null;
  return { messageId: parts[0], url: Buffer.from(parts[1], "base64url").toString("utf8") };
}
function base() {
  return publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}
export function openUrl(messageId: string) {
  return `${base()}/api/t/o/${signOpen(messageId)}`;
}
export function clickUrl(messageId: string, url: string) {
  return `${base()}/api/t/c/${signClick(messageId, url)}`;
}
// True when the request carries the cookie set for signed-in members; browsers that block third-party cookies send nothing.
export async function isOwnReader(cookieValue: string | undefined) {
  if (!cookieValue) return false;
  const expected = Buffer.from(await readerMarker(serverEnv().UNSUBSCRIBE_SECRET));
  const got = Buffer.from(cookieValue);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
