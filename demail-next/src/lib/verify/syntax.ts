import { domainToASCII } from "node:url";
import { DISPOSABLE_DOMAINS, DOMAIN_TYPOS, FREE_PROVIDERS, ROLE_LOCALS } from "./lists";

export type VerifyStatus = "valid" | "risky" | "invalid" | "unknown";
export type VerifyReason = "syntax" | "no_mail_server" | "disposable" | "role" | "typo" | "dns_unavailable";
export type VerifyResult = { status: VerifyStatus; reason: VerifyReason | null; suggestion: string | null; flags: ("role" | "free")[] };

const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export type Parsed = { local: string; domain: string };

// Checks the address shape the way mail servers read it; returns null for anything they would refuse.
export function parseAddress(raw: string): Parsed | null {
  const email = raw.trim();
  if (email.length < 3 || email.length > 254) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = domainToASCII(email.slice(at + 1).toLowerCase());
  if (local.length > 64 || !LOCAL.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const labels = domain.split(".");
  if (!domain || domain.length > 253 || labels.length < 2) return null;
  if (!labels.every((l) => LABEL.test(l)) || /^\d+$/.test(labels[labels.length - 1])) return null;
  return { local, domain };
}

function distanceOne(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

// A near miss of a big provider, or a known misspelling; null when the domain looks intended.
export function suggestDomain(domain: string): string | null {
  if (FREE_PROVIDERS.has(domain)) return null;
  const known = DOMAIN_TYPOS[domain];
  if (known) return known;
  for (const p of ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"]) if (distanceOne(domain, p)) return p;
  return null;
}

// Everything that needs no network: syntax, disposable, role and free-provider flags, typos.
export function staticChecks(raw: string): { parsed: Parsed | null; result: VerifyResult } {
  const parsed = parseAddress(raw);
  if (!parsed) return { parsed: null, result: { status: "invalid", reason: "syntax", suggestion: null, flags: [] } };
  const flags: VerifyResult["flags"] = [];
  const base = parsed.local.split("+")[0].toLowerCase();
  if (ROLE_LOCALS.has(base)) flags.push("role");
  if (FREE_PROVIDERS.has(parsed.domain)) flags.push("free");
  if (DISPOSABLE_DOMAINS.has(parsed.domain)) return { parsed, result: { status: "invalid", reason: "disposable", suggestion: null, flags } };
  const fix = suggestDomain(parsed.domain);
  if (fix) return { parsed, result: { status: "risky", reason: "typo", suggestion: `${parsed.local}@${fix}`, flags } };
  return { parsed, result: { status: flags.includes("role") ? "risky" : "valid", reason: flags.includes("role") ? "role" : null, suggestion: null, flags } };
}
