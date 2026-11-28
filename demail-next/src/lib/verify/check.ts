import "server-only";
import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { staticChecks, type VerifyResult } from "./syntax";

const TIMEOUT_MS = 4000;
type MailHost = "yes" | "no" | "unknown";

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error("dns timeout"), { code: "ETIMEOUT" })), TIMEOUT_MS))]);
}

// Only an answer that the name has no data counts as "no"; a timeout or a server failure stays "unknown".
const NO_DATA = new Set(["ENOTFOUND", "ENODATA"]);

async function hasMailHost(domain: string): Promise<MailHost> {
  try {
    const mx = await withTimeout(resolveMx(domain));
    if (mx.length === 1 && mx[0].exchange === "" && mx[0].priority === 0) return "no";
    if (mx.length > 0) return "yes";
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (!NO_DATA.has(code)) return "unknown";
  }
  // RFC 5321: a domain with no MX is mailed at its address records.
  let unknown = false;
  for (const lookup of [resolve4, resolve6]) {
    try {
      if ((await withTimeout(lookup(domain))).length > 0) return "yes";
    } catch (e) {
      if (!NO_DATA.has((e as { code?: string }).code ?? "")) unknown = true;
    }
  }
  return unknown ? "unknown" : "no";
}

// Verifies addresses with a per-run cache so one domain is looked up once. No SMTP probe is ever made.
export async function verifyEmails(emails: string[]): Promise<VerifyResult[]> {
  const cache = new Map<string, Promise<MailHost>>();
  const lookup = (domain: string) => {
    let hit = cache.get(domain);
    if (!hit) {
      hit = hasMailHost(domain);
      cache.set(domain, hit);
    }
    return hit;
  };
  const out: VerifyResult[] = new Array(emails.length);
  const queue = Array.from(emails.keys());
  async function worker() {
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
      const { parsed, result } = staticChecks(emails[i]);
      if (!parsed || result.status === "invalid") {
        out[i] = result;
        continue;
      }
      const host = await lookup(parsed.domain);
      if (host === "no") out[i] = { status: "invalid", reason: "no_mail_server", suggestion: result.suggestion, flags: result.flags };
      else if (host === "unknown") out[i] = { status: "unknown", reason: "dns_unavailable", suggestion: result.suggestion, flags: result.flags };
      else out[i] = result;
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, emails.length) }, worker));
  return out;
}
