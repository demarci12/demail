import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { webhookEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOLERANCE_S = 300;

// Svix scheme: HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed with the base64 part of the whsec_ secret.
function verify(secret: string, id: string, timestamp: string, signatures: string, body: string) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(request: Request) {
  const secret = webhookEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  const body = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature || !verify(secret, id, timestamp, signature, body)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  let event: { type?: unknown; data?: { email_id?: unknown } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const kind = event.type === "email.bounced" ? "bounce" : event.type === "email.complained" ? "complaint" : null;
  const emailId = event.data?.email_id;
  if (!kind || typeof emailId !== "string") return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { data: message } = await admin
    .from("messages")
    .select("id, organization_id, mailbox_id, contact_id, campaign_id")
    .eq("resend_id", emailId)
    .maybeSingle();
  if (!message) return NextResponse.json({ ok: true });
  const org = message.organization_id;

  const { error: eventError } = await admin.from("delivery_events").insert({
    organization_id: org,
    mailbox_id: message.mailbox_id,
    message_id: message.id,
    contact_id: message.contact_id,
    campaign_id: message.campaign_id,
    type: kind,
    source: "resend",
    detail: kind === "bounce" ? "Delivery failure" : "Marked as spam by the recipient",
  });
  if (eventError && eventError.code !== "23505") {
    console.error("delivery event insert failed", eventError.code);
    return NextResponse.json({ error: "store_failed" }, { status: 500 });
  }

  const { data: contact } = await admin.from("contacts").select("email").eq("id", message.contact_id).eq("organization_id", org).maybeSingle();
  if (contact) {
    const { error } = await admin.from("suppressed_recipients").insert({
      organization_id: org,
      email: contact.email,
      reason: kind === "bounce" ? "Delivery failure" : "Spam complaint",
      source: kind,
      campaign_id: message.campaign_id,
    });
    if (error && error.code !== "23505") {
      console.error("suppression insert failed", error.code);
      return NextResponse.json({ error: "store_failed" }, { status: 500 });
    }
  }
  await admin
    .from("campaign_contacts")
    .update({ status: "stopped", next_send_at: null, stopped_reason: kind === "bounce" ? "bounced" : "complained" })
    .eq("organization_id", org)
    .eq("contact_id", message.contact_id)
    .eq("status", "active");
  return NextResponse.json({ ok: true });
}
