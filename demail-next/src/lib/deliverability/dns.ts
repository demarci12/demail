import "server-only";
import { resolveCname, resolveTxt } from "node:dns/promises";

export type CheckStatus = "pass" | "missing" | "fail" | "unknown";
export type ProviderHint = "google" | "microsoft" | "resend" | "other";
export type DomainCheck = {
  spf: { status: CheckStatus; record: string | null };
  dkim: { status: CheckStatus };
  dmarc: { status: CheckStatus; record: string | null; policy: string | null };
};

const TIMEOUT_MS = 4000;
const SPF_INCLUDE: Record<ProviderHint, string | null> = {
  google: "_spf.google.com",
  microsoft: "spf.protection.outlook.com",
  resend: null,
  other: null,
};

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns timeout")), TIMEOUT_MS))]);
}

// Returns null when the name has no answer or the lookup fails, so the caller reports "missing".
async function txt(name: string): Promise<string[] | null> {
  try {
    return (await withTimeout(resolveTxt(name))).map((chunks) => chunks.join(""));
  } catch {
    return null;
  }
}

async function cname(name: string): Promise<string[] | null> {
  try {
    return await withTimeout(resolveCname(name));
  } catch {
    return null;
  }
}

export function dkimSelectors(providerHint: ProviderHint, userSelector: string | null): string[] {
  const base = providerHint === "google" ? ["google"] : providerHint === "microsoft" ? ["selector1", "selector2"] : providerHint === "resend" ? ["resend"] : ["google", "selector1", "selector2", "resend"];
  return [...new Set([...(userSelector ? [userSelector] : []), ...base])];
}

export async function checkDomain(domain: string, providerHint: ProviderHint, dkimSelector: string | null): Promise<DomainCheck> {
  const [rootTxt, dmarcTxt] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`)]);

  const spfRecords = (rootTxt ?? []).filter((r) => /^v=spf1(\s|$)/i.test(r));
  let spf: DomainCheck["spf"];
  if (spfRecords.length === 0) spf = { status: "missing", record: null };
  else if (spfRecords.length > 1) spf = { status: "fail", record: spfRecords[0] };
  else {
    const record = spfRecords[0];
    const include = SPF_INCLUDE[providerHint];
    const strictAll = /\s[~-]all\s*$/i.test(record);
    const hasInclude = !include || record.toLowerCase().includes(`include:${include}`);
    spf = { status: strictAll && hasInclude ? "pass" : "fail", record };
  }

  const dmarcRecord = (dmarcTxt ?? []).find((r) => /^v=DMARC1\s*;?/i.test(r)) ?? null;
  const policy = dmarcRecord?.match(/;\s*p=([a-z]+)/i)?.[1]?.toLowerCase() ?? null;
  const dmarc: DomainCheck["dmarc"] = dmarcRecord ? { status: policy ? "pass" : "fail", record: dmarcRecord, policy } : { status: "missing", record: null, policy: null };

  // The selector cannot be known, so no hit means unknown rather than missing.
  let dkim: CheckStatus = "unknown";
  for (const selector of dkimSelectors(providerHint, dkimSelector)) {
    const host = `${selector}._domainkey.${domain}`;
    const [c, t] = await Promise.all([cname(host), txt(host)]);
    if ((c && c.length) || (t && t.some((r) => /v=DKIM1|p=/i.test(r)))) {
      dkim = "pass";
      break;
    }
  }
  return { spf, dkim: { status: dkim }, dmarc };
}

export type PublishRecords = {
  spf: { host: string; value: string | null; note: string };
  dmarc: { host: string; value: string };
  dkim: { host: string; note: string };
};

// Merges the provider include into an existing SPF record instead of proposing a second one.
export function recordsToPublish(domain: string, providerHint: ProviderHint, ownerEmail: string, existingSpf: string | null = null, dkimSelector: string | null = null): PublishRecords {
  const include = SPF_INCLUDE[providerHint];
  let spfValue: string | null = null;
  let spfNote = "Resend lists its own SPF and DKIM records in its dashboard under Domains. Copy them from there.";
  if (include) {
    if (existingSpf && /^v=spf1(\s|$)/i.test(existingSpf)) {
      spfValue = existingSpf.toLowerCase().includes(`include:${include}`)
        ? existingSpf
        : existingSpf.replace(/\s*[~\-?+]all\s*$/i, "").trim() + ` include:${include} ~all`;
      spfNote = "A domain may publish only one SPF record. This is your current record with the include added.";
    } else {
      spfValue = `v=spf1 include:${include} ~all`;
      spfNote = "Publish this as a TXT record on the domain itself. A domain may publish only one SPF record.";
    }
  }
  const selector = dkimSelector ?? (providerHint === "google" ? "google" : providerHint === "microsoft" ? "selector1" : providerHint === "resend" ? "resend" : "<selector>");
  return {
    spf: { host: domain, value: spfValue, note: spfNote },
    dmarc: { host: `_dmarc.${domain}`, value: `v=DMARC1; p=none; rua=mailto:${ownerEmail}` },
    dkim: {
      host: `${selector}._domainkey.${domain}`,
      note: "The value comes from your provider: the Google Workspace or Microsoft 365 admin console, or the Resend dashboard. Publish exactly what it shows.",
    },
  };
}
