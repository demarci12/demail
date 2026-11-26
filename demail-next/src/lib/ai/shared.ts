// Pure AI helpers with no imports, so the check script can load this file directly.
export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_AI_MODEL = "gpt-4o-mini";
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function parseIpv4(ip: string): number[] | null {
  const m = IPV4.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}
function privateIpv4([a, b]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}
// Expands an IPv6 literal (with an optional dotted IPv4 tail) to eight 16-bit groups.
function parseIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  const tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  if (s.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
    const prefix = s.slice(0, lastColon + 1);
    s = prefix.endsWith("::") ? prefix : prefix.slice(0, -1);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const group = (h: string) => (h === "" ? [] : h.split(":"));
  const head = group(halves[0]);
  const rest = halves.length === 2 ? group(halves[1]) : [];
  const toNum = (g: string) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN);
  const left = head.map(toNum);
  const right = rest.map(toNum);
  if ([...left, ...right].some(Number.isNaN)) return null;
  const known = left.length + right.length + tail.length;
  if (halves.length === 1) return known === 8 ? [...left, ...right, ...tail] : null;
  if (known > 7) return null;
  return [...left, ...Array(8 - known).fill(0), ...right, ...tail];
}
// True for loopback, private, link-local, CGNAT, unique-local, multicast, unspecified and IPv6 forms embedding one.
export function isPrivateAddress(ip: string): boolean {
  const raw = ip.trim().replace(/^\[|\]$/g, "");
  const v4 = parseIpv4(raw);
  if (v4) return privateIpv4(v4);
  if (!raw.includes(":")) return false;
  const g = parseIpv6(raw);
  if (!g) return true;
  const v4At = (i: number) => privateIpv4([g[i] >> 8, g[i] & 255, g[i + 1] >> 8, g[i + 1] & 255]);
  // IPv4-compatible and IPv4-mapped (::/96, ::ffff:0:0/96) and NAT64 (64:ff9b::/96) carry an IPv4 in the low 32 bits.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0 || g[5] === 0xffff)) return v4At(6);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4At(6);
  // Local-use NAT64 (64:ff9b:1::/48) translates to addresses chosen by the network.
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true;
  // 6to4 (2002::/16) carries an IPv4 right after the prefix.
  if (g[0] === 0x2002) return v4At(1);
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if ((g[0] & 0xffc0) === 0xfe80) return true;
  return (g[0] & 0xff00) === 0xff00;
}
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan"];
// A workspace base URL must be public https with no credentials; returned without a trailing slash.
export function checkBaseUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  const value = raw.trim();
  if (!value || value.length > 300) return { ok: false, message: "The base URL must be at most 300 characters." };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: "Enter a valid base URL such as https://api.openai.com/v1." };
  }
  if (url.protocol !== "https:") return { ok: false, message: "The base URL must start with https://." };
  if (url.username || url.password) return { ok: false, message: "The base URL must not contain a user name or password." };
  if (url.search || url.hash) return { ok: false, message: "The base URL must not contain a query or fragment." };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, message: "The base URL must point at a public host." };
  }
  if ((parseIpv4(host) || host.includes(":")) && isPrivateAddress(host)) {
    return { ok: false, message: "The base URL must point at a public host." };
  }
  const out = url.href.replace(/\/+$/, "");
  if (out.length > 300) return { ok: false, message: "The base URL must be at most 300 characters." };
  return { ok: true, url: out };
}
// Pulls the first JSON object out of model output, tolerating code fences; never throws.
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/```[a-zA-Z]*\s*/g, "").replace(/```/g, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(stripped.slice(start, end + 1));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
// A step draft is a JSON object with a short subject and a plain-text body.
export function parseStepDraft(text: string): { subject: string; body: string } | null {
  const obj = parseJsonObject(text);
  if (!obj || typeof obj.subject !== "string" || typeof obj.body !== "string") return null;
  const subject = obj.subject.trim();
  const body = obj.body.trim();
  if (subject.length < 1 || subject.length > 200 || body.length < 1 || body.length > 5000) return null;
  return { subject, body };
}
// A reply draft is plain text; a surrounding code fence and a leading Subject line are dropped.
export function cleanReplyDraft(text: string): string | null {
  let out = text.trim();
  const fenced = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/.exec(out);
  if (fenced) out = fenced[1].trim();
  out = out.replace(/^subject:[^\n]*(\n|$)/i, "").trim();
  return out.length >= 1 && out.length <= 5000 ? out : null;
}
export const INTENTS = ["interested", "meeting", "question", "not_interested", "unsubscribe", "out_of_office", "referral", "other"] as const;
export type Intent = (typeof INTENTS)[number];
export const INTENT_LABELS: Record<Intent, string> = {
  interested: "Interested",
  meeting: "Wants a meeting",
  question: "Question",
  not_interested: "Not interested",
  unsubscribe: "Asked to stop",
  out_of_office: "Out of office",
  referral: "Referral",
  other: "Other",
};
export function isIntent(v: unknown): v is Intent {
  return typeof v === "string" && (INTENTS as readonly string[]).includes(v);
}
// A classification is a JSON object with one of the fixed intents and an optional short summary.
export function parseIntent(text: string): { intent: Intent; summary: string | null } | null {
  const obj = parseJsonObject(text);
  if (!obj || !isIntent(obj.intent)) return null;
  const summary = typeof obj.summary === "string" ? obj.summary.trim().slice(0, 200) : "";
  return { intent: obj.intent, summary: summary || null };
}
