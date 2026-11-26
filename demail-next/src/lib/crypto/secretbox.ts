import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { mailEnv } from "@/lib/env";
// AES-256-GCM; sealed format is v1.<iv>.<tag>.<ciphertext>, all base64url.
function toKey(value: string, name: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded (openssl rand -base64 32)`);
  return key;
}
export function seal(plaintext: string): string {
  const raw = mailEnv().MAILBOX_ENCRYPTION_KEY;
  if (!raw) throw new Error("MAILBOX_ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", toKey(raw, "MAILBOX_ENCRYPTION_KEY"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}
// Tries the current key, then the previous one, so a key can be rotated without reconnecting.
export function open(sealed: string): string {
  const [version, iv, tag, ct] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported sealed value");
  const env = mailEnv();
  const keys = [
    ["MAILBOX_ENCRYPTION_KEY", env.MAILBOX_ENCRYPTION_KEY],
    ["MAILBOX_ENCRYPTION_KEY_PREVIOUS", env.MAILBOX_ENCRYPTION_KEY_PREVIOUS],
  ].filter((k): k is [string, string] => !!k[1]);
  if (keys.length === 0) throw new Error("MAILBOX_ENCRYPTION_KEY is not set");
  for (const [name, value] of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", toKey(value, name), Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      // Wrong key: try the next one.
    }
  }
  throw new Error("Could not open sealed value with the configured keys");
}
export type SealDomain = "ai-key" | "crm-token";
// Per-domain keys derived with HKDF so an AI key or CRM token never opens as a mailbox token.
function domainKey(raw: string, name: string, domain: SealDomain): Buffer {
  return Buffer.from(hkdfSync("sha256", toKey(raw, name), Buffer.alloc(0), `demail:${domain}:v1`, 32));
}
export function sealFor(domain: SealDomain, plaintext: string): string {
  const raw = mailEnv().MAILBOX_ENCRYPTION_KEY;
  if (!raw) throw new Error("MAILBOX_ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", domainKey(raw, "MAILBOX_ENCRYPTION_KEY", domain), iv);
  cipher.setAAD(Buffer.from(domain));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["d1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}
export function openFor(domain: SealDomain, sealed: string): string {
  const [version, iv, tag, ct] = sealed.split(".");
  if (version !== "d1" || !iv || !tag || !ct) throw new Error("Unsupported sealed value");
  const env = mailEnv();
  const keys = [
    ["MAILBOX_ENCRYPTION_KEY", env.MAILBOX_ENCRYPTION_KEY],
    ["MAILBOX_ENCRYPTION_KEY_PREVIOUS", env.MAILBOX_ENCRYPTION_KEY_PREVIOUS],
  ].filter((k): k is [string, string] => !!k[1]);
  if (keys.length === 0) throw new Error("MAILBOX_ENCRYPTION_KEY is not set");
  for (const [name, value] of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", domainKey(value, name, domain), Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(domain));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      // Wrong key: try the next one.
    }
  }
  throw new Error("Could not open sealed value with the configured keys");
}
export function canSeal(): boolean {
  return !!mailEnv().MAILBOX_ENCRYPTION_KEY;
}
