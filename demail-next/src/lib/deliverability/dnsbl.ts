import "server-only";
import { resolve4 } from "node:dns/promises";

export type DnsblStatus = "clean" | "listed" | "unknown";
export type DnsblAnswer = { status: DnsblStatus; answer: string | null };

const TIMEOUT_MS = 3000;
const HOSTNAME = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

// Domain blocklists with public query access. Barracuda lists IP addresses only, so it is not queried until sending IPs are known.
// refused: answers a list gives when it declines to answer (blocked resolver, over quota), which mean "unknown", never "listed".
const KNOWN_LISTS: Record<string, { refused: string[] }> = {
  "dbl.spamhaus.org": { refused: ["127.0.1.255"] },
  "multi.surbl.org": { refused: ["127.0.0.1"] },
  "multi.uribl.com": { refused: ["127.0.0.1"] },
};

// DNSBL_ZONES (comma separated) replaces the defaults. Invalid names are dropped and at most 8 are used.
export function dnsblZones(env = process.env.DNSBL_ZONES): string[] {
  const custom = (env ?? "")
    .split(",")
    .map((z) => z.trim().toLowerCase())
    .filter((z) => z.length <= 253 && HOSTNAME.test(z));
  return [...new Set(custom.length ? custom : Object.keys(KNOWN_LISTS))].slice(0, 8);
}

// Turns the A records of one lookup into a verdict. Only a 127.x.x.x answer outside the refusal ranges counts as listed.
export function interpretAnswers(zone: string, addresses: string[]): DnsblAnswer {
  if (addresses.length === 0) return { status: "clean", answer: null };
  const refused = KNOWN_LISTS[zone]?.refused ?? [];
  const real = addresses.filter((a) => /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a) && !a.startsWith("127.255.255.") && !refused.includes(a));
  return real.length ? { status: "listed", answer: real[0] } : { status: "unknown", answer: addresses[0].slice(0, 64) };
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("dns timeout")), TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

// Looks one domain up on one list. Only a plain "no such name" is clean; a timeout or resolver error is unknown.
export async function queryList(domain: string, zone: string): Promise<DnsblAnswer> {
  if (!HOSTNAME.test(domain) || !HOSTNAME.test(zone)) return { status: "unknown", answer: null };
  try {
    return interpretAnswers(zone, await withTimeout(resolve4(`${domain}.${zone}`)));
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? { status: "clean", answer: null } : { status: "unknown", answer: null };
  }
}
