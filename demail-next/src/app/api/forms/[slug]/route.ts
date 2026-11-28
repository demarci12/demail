import { NextResponse, type NextRequest } from "next/server";
import type { Json } from "@/lib/database.types";
import { publicEnv, turnstileEnabled } from "@/lib/env";
import { clientIp, rateBucket, verifyFillToken } from "@/lib/forms/token";
import { verifyTurnstile } from "@/lib/forms/turnstile";
import { normalizeRedirectUrl, parseFields, validateSubmission } from "@/lib/input";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SLUG_RE = /^[A-Za-z0-9_-]{8,32}$/;
const MAX_BODY = 64 * 1024;
const RESULTS: Record<string, string> = { rate_limited: "rate", closed: "closed", invalid: "invalid" };
// Redirect base comes from the environment, never from the Host header; query values are fixed codes.
function back(slug: string, query: string, embed: boolean) {
  const q = embed ? `${query}&embed=1` : query;
  return NextResponse.redirect(new URL(`/f/${slug}?${q}`, publicEnv().NEXT_PUBLIC_APP_URL), 303);
}
// The redirect target comes only from the stored form row and is re-checked here; an embed never leaves its frame.
function success(form: { redirect_url?: string | null }, slug: string, embed: boolean) {
  const target = embed ? null : normalizeRedirectUrl(form.redirect_url);
  return target ? NextResponse.redirect(target, 303) : back(slug, "done=1", embed);
}
export function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return new NextResponse(null, { status: 404 });
  const length = req.headers.get("content-length");
  if (length === null) return new NextResponse(null, { status: 411 });
  if (!/^\d+$/.test(length) || Number(length) > MAX_BODY) return new NextResponse(null, { status: 413 });
  const admin = createAdminClient();
  const { data: form } = await admin
    .from("forms")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!form) return back(slug, "error=closed", false);
  let data: FormData;
  try {
    data = await req.formData();
  } catch {
    return back(slug, "error=failed", false);
  }
  const get = (name: string) => {
    const v = data.get(name);
    return typeof v === "string" ? v : null;
  };
  const embed = get("embed") === "1";
  // A filled honeypot looks like success to the bot and writes nothing.
  if (get("website")) return success(form, slug, embed);
  if (!verifyFillToken(form.id, get("t"))) return back(slug, "error=expired", embed);
  const ip = clientIp(req);
  if (turnstileEnabled() && !(await verifyTurnstile(get("cf-turnstile-response"), ip))) return back(slug, "error=captcha", embed);
  const fields = parseFields(form.fields);
  if (!fields) return back(slug, "error=failed", embed);
  const result = validateSubmission(fields, get, !!form.consent_text);
  if (!result.ok) return back(slug, `error=${result.error}`, embed);
  const { data: status, error } = await admin.rpc("submit_form", {
    p_form: form.id,
    p_bucket: rateBucket(form.id, ip),
    p_contact: result.contact as Json,
    p_answers: result.answers as Json,
    p_consented: result.consented,
  });
  if (error) {
    console.error("form submission failed", form.id);
    return back(slug, "error=failed", embed);
  }
  if (status === "ok") return success(form, slug, embed);
  return back(slug, `error=${RESULTS[status ?? ""] ?? "failed"}`, embed);
}
