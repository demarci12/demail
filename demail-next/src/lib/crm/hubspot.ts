import "server-only";
import { HUBSPOT_PROPERTIES } from "./map";
export type CrmErrorCode = "auth" | "scope" | "rate" | "provider";
const MESSAGES: Record<CrmErrorCode, string> = {
  auth: "HubSpot refused the token. Paste a new one.",
  scope: "The HubSpot token is missing the contacts read or write scope.",
  rate: "HubSpot is rate limiting. Sync will retry.",
  provider: "HubSpot did not answer. Sync will retry.",
};
// Messages are fixed so a token or a response body never reaches a page or a log.
export class CrmError extends Error {
  code: CrmErrorCode;
  status: number | null;
  constructor(code: CrmErrorCode, status: number | null = null) {
    super(MESSAGES[code]);
    this.name = "CrmError";
    this.code = code;
    this.status = status;
  }
}
export type HubSpotContact = { id: string; properties: Record<string, string | null> };
async function hubspot(token: string, method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`https://api.hubapi.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new CrmError("provider");
  }
  if (res.status === 401) throw new CrmError("auth", 401);
  if (res.status === 403) throw new CrmError("scope", 403);
  if (res.status === 429) throw new CrmError("rate", 429);
  if (!res.ok) throw new CrmError("provider", res.status);
  try {
    return await res.json();
  } catch {
    throw new CrmError("provider", res.status);
  }
}
function asContacts(data: unknown): { results: HubSpotContact[]; after: string | null } {
  const d = (data ?? {}) as { results?: unknown; paging?: { next?: { after?: unknown } } };
  const results = Array.isArray(d.results)
    ? d.results
        .map((r) => r as { id?: unknown; properties?: unknown })
        .filter((r) => typeof r.id === "string" || typeof r.id === "number")
        .map((r) => ({ id: String(r.id), properties: (r.properties && typeof r.properties === "object" ? r.properties : {}) as Record<string, string | null> }))
    : [];
  const after = d.paging?.next?.after;
  return { results, after: typeof after === "string" || typeof after === "number" ? String(after) : null };
}
export async function checkToken(token: string): Promise<void> {
  await hubspot(token, "GET", "/crm/v3/objects/contacts?limit=1");
}
export async function portalId(token: string): Promise<string | null> {
  try {
    const data = (await hubspot(token, "GET", "/account-info/v3/details")) as { portalId?: unknown };
    const id = data?.portalId;
    return typeof id === "number" || typeof id === "string" ? String(id).slice(0, 40) : null;
  } catch {
    return null;
  }
}
export async function searchContactsSince(token: string, cursorMs: number, after?: string | null) {
  const data = await hubspot(token, "POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "lastmodifieddate", operator: "GTE", value: String(cursorMs) }] }],
    sorts: [{ propertyName: "lastmodifieddate", direction: "ASCENDING" }],
    properties: HUBSPOT_PROPERTIES,
    limit: 100,
    ...(after ? { after } : {}),
  });
  return asContacts(data);
}
export async function findContactIdByEmail(token: string, email: string): Promise<string | null> {
  const data = await hubspot(token, "POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    properties: ["email"],
    limit: 1,
  });
  return asContacts(data).results[0]?.id ?? null;
}
export async function createContact(token: string, props: Record<string, string | null>): Promise<string> {
  const properties = Object.fromEntries(Object.entries(props).filter((e): e is [string, string] => !!e[1]));
  try {
    const data = (await hubspot(token, "POST", "/crm/v3/objects/contacts", { properties })) as { id?: unknown };
    if (typeof data?.id === "string" || typeof data?.id === "number") return String(data.id);
    throw new CrmError("provider");
  } catch (e) {
    if (!(e instanceof CrmError) || e.status !== 409 || !properties.email) throw e;
    const id = await findContactIdByEmail(token, properties.email);
    if (!id) throw new CrmError("provider");
    return id;
  }
}
export async function createNote(token: string, contactId: string, note: { timestamp: string; body: string }): Promise<void> {
  await hubspot(token, "POST", "/crm/v3/objects/notes", {
    properties: { hs_timestamp: note.timestamp, hs_note_body: note.body },
    associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
  });
}
