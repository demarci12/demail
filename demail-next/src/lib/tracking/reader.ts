// Edge-safe (Web Crypto only) so middleware and the tracking routes share one marker.
const KEY_LABEL = "demail:tracking:v1";
const READER_LABEL = "demail:reader";
export const READER_COOKIE = "demail_reader";
async function hmac(key: BufferSource, data: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}
function b64url(buf: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Value of the own-reader cookie, derived from the same key as the tracking tokens.
export async function readerMarker(secret: string) {
  const key = await hmac(new TextEncoder().encode(secret), KEY_LABEL);
  return b64url(await hmac(key, READER_LABEL));
}
