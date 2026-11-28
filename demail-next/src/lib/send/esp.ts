// ESP matching: send from a Google mailbox to a Google-hosted recipient and from Microsoft to Microsoft. Never required.
export type Esp = "google" | "microsoft" | "other";
const DOMAINS: Record<string, Esp> = {
  "gmail.com": "google", "googlemail.com": "google",
  "outlook.com": "microsoft", "hotmail.com": "microsoft", "live.com": "microsoft", "msn.com": "microsoft", "outlook.hu": "microsoft", "hotmail.co.uk": "microsoft",
};
export function espFromDomain(domain: string): Esp | null {
  return DOMAINS[domain.toLowerCase()] ?? null;
}
// MX exchange names: Google Workspace and Gmail end in google.com or googlemail.com, Microsoft 365 in mail.protection.outlook.com.
export function espFromMx(exchanges: string[]): Esp {
  const hosts = exchanges.map((x) => x.toLowerCase().replace(/\.$/, ""));
  if (hosts.some((h) => h === "google.com" || h.endsWith(".google.com") || h.endsWith(".googlemail.com"))) return "google";
  if (hosts.some((h) => h.endsWith(".protection.outlook.com") || h.endsWith(".mail.protection.outlook.com") || h.endsWith(".olc.protection.outlook.com"))) return "microsoft";
  return "other";
}
type Candidate = { m: { id: string; provider: string }; sent: number };
// Pinned mailbox first, else least used. With matching on and a Google or Microsoft recipient, a same-provider sender wins; with none, any eligible sender does.
export function chooseSender<T extends Candidate>(eligible: T[], pinnedId: string | null, matching: boolean, esp: Esp | null): T | null {
  if (!eligible.length) return null;
  const same = matching && (esp === "google" || esp === "microsoft") ? eligible.filter((c) => c.m.provider === esp) : [];
  const pool = same.length ? same : eligible;
  return pool.find((c) => c.m.id === pinnedId) ?? [...pool].sort((a, b) => a.sent - b.sent)[0];
}
