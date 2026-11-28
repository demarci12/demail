import "server-only";
import { z } from "zod";
import { assertPublicHost } from "@/lib/ai/provider";
import { cleanEmail, cleanPhone } from "./shared";
import type { Found, Person } from "./waterfall";
import type { Vote } from "./consensus";

export type ProviderKind = "hunter" | "apollo" | "millionverifier" | "http";
export type ProviderRow = { kind: ProviderKind; base_url: string | null };

// Carries only a fixed sentence; never a key, a URL or a provider response.
export class ProviderError extends Error {
  constructor(message = "The provider did not answer.") {
    super(message);
    this.name = "ProviderError";
  }
}
const MAX_BODY = 200_000;

// https only, no redirects, a timeout and a size cap; the key goes in a header (or the vendor's own query parameter) and is never logged.
async function getJson(url: string, init: RequestInit, schema: z.ZodType<unknown>): Promise<unknown> {
  if (!url.startsWith("https://")) throw new ProviderError();
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    throw new ProviderError();
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError("The provider refused the key.");
  if (res.status === 404) return {};
  if (!res.ok) throw new ProviderError();
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new ProviderError();
  }
  if (text.length > MAX_BODY) throw new ProviderError();
  const parsed = schema.safeParse(safeParse(text));
  if (!parsed.success) throw new ProviderError("The provider returned something unusable.");
  return parsed.data;
}
function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
const str = z.string().nullish();
const customUrl = async (p: ProviderRow) => {
  if (!p.base_url) throw new ProviderError();
  try {
    return await assertPublicHost(p.base_url);
  } catch {
    throw new ProviderError("The provider URL is not allowed.");
  }
};

const hunterShape = z.object({ data: z.object({ email: str }).nullish() });
const apolloShape = z.object({ person: z.object({ email: str, phone_numbers: z.array(z.object({ sanitized_number: str })).nullish() }).nullish() });
const enrichShape = z.object({ email: str, phone: str });

export async function findContact(p: ProviderRow, key: string, person: Person): Promise<Found> {
  if (p.kind === "hunter") {
    if (!person.domain) return {};
    const q = new URLSearchParams({ domain: person.domain, first_name: person.firstName, last_name: person.lastName });
    const r = hunterShape.parse(await getJson(`https://api.hunter.io/v2/email-finder?${q}`, { headers: { "X-API-KEY": key } }, hunterShape));
    return { email: cleanEmail(r.data?.email) };
  }
  if (p.kind === "apollo") {
    const body = { first_name: person.firstName, last_name: person.lastName, organization_name: person.company ?? undefined, domain: person.domain ?? undefined };
    const r = apolloShape.parse(
      await getJson("https://api.apollo.io/api/v1/people/match", { method: "POST", headers: { "X-Api-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) }, apolloShape),
    );
    return { email: cleanEmail(r.person?.email), phone: cleanPhone(r.person?.phone_numbers?.[0]?.sanitized_number) };
  }
  if (p.kind === "http") {
    const url = await customUrl(p);
    const body = { first_name: person.firstName, last_name: person.lastName, company: person.company, domain: person.domain };
    const r = enrichShape.parse(await getJson(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }, enrichShape));
    return { email: cleanEmail(r.email), phone: cleanPhone(r.phone) };
  }
  throw new ProviderError();
}

const mvShape = z.object({ result: z.string().max(40).nullish() });
const voteShape = z.object({ status: z.string().max(40).nullish() });
const MV_VOTES: Record<string, Vote> = { ok: "valid", valid: "valid", catch_all: "catch_all", invalid: "invalid", disposable: "invalid", unknown: "unknown" };
const GENERIC_VOTES: Record<string, Vote> = { valid: "valid", invalid: "invalid", risky: "risky", catch_all: "catch_all", unknown: "unknown" };

export async function verifyEmail(p: ProviderRow, key: string, email: string): Promise<Vote> {
  if (p.kind === "millionverifier") {
    // MillionVerifier takes the key as a query parameter; the URL is never logged or stored.
    const q = new URLSearchParams({ api: key, email });
    const r = mvShape.parse(await getJson(`https://api.millionverifier.com/api/v3/?${q}`, {}, mvShape));
    return MV_VOTES[r.result ?? ""] ?? "unknown";
  }
  if (p.kind === "http") {
    const url = await customUrl(p);
    const r = voteShape.parse(await getJson(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ email }) }, voteShape));
    return GENERIC_VOTES[r.status ?? ""] ?? "unknown";
  }
  throw new ProviderError();
}
