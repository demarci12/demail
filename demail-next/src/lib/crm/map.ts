// Pure HubSpot mapping helpers; no imports so the check script can load this file directly.
export const HUBSPOT_PROPERTIES = ["email", "firstname", "lastname", "company", "phone", "hs_email_optout", "lastmodifieddate"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type ContactFields = { first_name: string | null; last_name: string | null; company: string | null; phone: string | null };
export type MappedContact = ContactFields & { email: string; optedOut: boolean; modifiedMs: number | null };
function text(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? v.slice(0, 200) : null;
}
export function millis(value: string | null | undefined): number | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(n) ? n : null;
}
export function mapHubSpotContact(props: Record<string, string | null | undefined>): MappedContact | null {
  const email = (props.email ?? "").trim().toLowerCase();
  if (email.length > 320 || !EMAIL.test(email)) return null;
  return {
    email,
    first_name: text(props.firstname),
    last_name: text(props.lastname),
    company: text(props.company),
    phone: text(props.phone),
    optedOut: props.hs_email_optout === "true",
    modifiedMs: millis(props.lastmodifieddate),
  };
}
// Only fields that are blank in Demail and set in HubSpot; existing values are never overwritten.
export function fillBlanks(existing: Partial<ContactFields>, incoming: Partial<ContactFields>): Partial<ContactFields> {
  const out: Partial<ContactFields> = {};
  for (const key of ["first_name", "last_name", "company", "phone"] as const) {
    const current = existing[key];
    const next = incoming[key];
    if ((current === null || current === undefined || current.trim() === "") && next) out[key] = next;
  }
  return out;
}
export function replyNoteBody(input: { subject: string | null; fromEmail: string | null; campaignName: string | null; body: string | null }): string {
  return [
    "Reply received in Demail",
    `Subject: ${input.subject || "(no subject)"}`,
    `From: ${input.fromEmail || "unknown"}`,
    `Campaign: ${input.campaignName || "none"}`,
    "",
    (input.body ?? "").slice(0, 2000),
  ].join("\n");
}
