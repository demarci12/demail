export type HitType = "open" | "click";
export type FilterReason = "bot" | "prefetch" | "privacy_proxy" | "too_early" | "own_read";
export type Hit = {
  type: HitType;
  method: string;
  userAgent: string | null;
  ip: string | null;
  headers: Record<string, string | undefined>;
  msSinceSent: number | null;
  ownReader: boolean;
};
export type Verdict = { counted: boolean; reason: FilterReason | null };
export const PREFETCH_HEADERS = ["purpose", "sec-purpose", "x-moz"] as const;
// Gmail's image proxy (GoogleImageProxy) is deliberately absent: it fetches at read time, so it counts as an open.
export const BOT_AGENTS = [
  /googlebot/i,
  /bingbot/i,
  /slackbot/i,
  /facebookexternalhit/i,
  /\bcurl\//i,
  /python-requests/i,
  /headlesschrome/i,
  /barracuda/i,
  /proofpoint/i,
  /mimecast/i,
  /safelinks/i,
  /microsoft office protocol discovery/i,
  /\bbot\b|crawler|spider/i,
] as const;
// Apple Mail Privacy Protection fetches through addresses in 17.0.0.0/8.
export const PRIVACY_PROXY_FIRST_OCTETS = [17] as const;
export const MIN_CLICK_MS = 10_000;
export const MIN_OPEN_MS = 3_000;
function firstOctet(ip: string | null) {
  if (!ip) return null;
  const v4 = ip.trim().replace(/^::ffff:/i, "");
  const m = /^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.exec(v4);
  return m ? Number(m[1]) : null;
}
export function classifyHit(hit: Hit): Verdict {
  if (hit.ownReader) return { counted: false, reason: "own_read" };
  if (hit.method.toUpperCase() === "HEAD" || PREFETCH_HEADERS.some((h) => /prefetch|preview/i.test(hit.headers[h] ?? ""))) return { counted: false, reason: "prefetch" };
  const ua = hit.userAgent?.trim() ?? "";
  if (!ua || BOT_AGENTS.some((r) => r.test(ua))) return { counted: false, reason: "bot" };
  const octet = firstOctet(hit.ip);
  if (octet !== null && (PRIVACY_PROXY_FIRST_OCTETS as readonly number[]).includes(octet)) return { counted: false, reason: "privacy_proxy" };
  const min = hit.type === "click" ? MIN_CLICK_MS : MIN_OPEN_MS;
  if (hit.msSinceSent !== null && hit.msSinceSent < min) return { counted: false, reason: "too_early" };
  return { counted: true, reason: null };
}
