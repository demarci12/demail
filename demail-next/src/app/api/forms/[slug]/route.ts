import { NextResponse, type NextRequest } from "next/server";
import type { Json } from "@/lib/database.types";
import { publicEnv, turnstileEnabled } from "@/lib/env";
import { FILE_BODY_MAX_BYTES, FILE_MAX_BYTES, fileDisplayName, safeFileStem, sniffFileType, type FileType } from "@/lib/forms/files";
import { clientIp, rateBucket, verifyFillToken } from "@/lib/forms/token";
import { verifyTurnstile } from "@/lib/forms/turnstile";
import { normalizeRedirectUrl, parseFields, validateSubmission } from "@/lib/input";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SLUG_RE = /^[A-Za-z0-9_-]{8,32}$/;
const MAX_BODY = 64 * 1024;
const BUCKET = "form-files";
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
  // Only a form with file fields may send more than 64 KB, and never more than the platform body limit allows.
  if (!/^\d+$/.test(length) || Number(length) > FILE_BODY_MAX_BYTES) return new NextResponse(null, { status: 413 });
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
  const fileFields = fields.filter((f) => f.type === "file");
  if (fileFields.length === 0 && Number(length) > MAX_BODY) return new NextResponse(null, { status: 413 });
  const result = validateSubmission(fields, get, !!form.consent_text);
  if (!result.ok) return back(slug, `error=${result.error}`, embed);
  const uploads: { key: string; stem: string; type: FileType; bytes: Uint8Array }[] = [];
  for (const f of fileFields) {
    const value = data.get(`f_${f.key}`);
    if (!(value instanceof File) || value.size === 0) {
      if (f.required) return back(slug, "error=invalid", embed);
      continue;
    }
    if (value.size > FILE_MAX_BYTES) return back(slug, "error=filesize", embed);
    const bytes = new Uint8Array(await value.arrayBuffer());
    const type = sniffFileType(bytes);
    if (!type) return back(slug, "error=filetype", embed);
    const stem = safeFileStem(value.name);
    uploads.push({ key: f.key, stem, type, bytes });
    result.answers[f.key] = fileDisplayName(stem, type);
  }
  const base = { p_form: form.id, p_bucket: rateBucket(form.id, ip), p_contact: result.contact as Json, p_answers: result.answers as Json, p_consented: result.consented };
  // A form without file fields keeps calling submit_form, which works before migration 003820.
  if (fileFields.length === 0) {
    const { data: status, error } = await admin.rpc("submit_form", base);
    if (error) {
      console.error("form submission failed", form.id);
      return back(slug, "error=failed", embed);
    }
    if (status === "ok") return success(form, slug, embed);
    return back(slug, `error=${RESULTS[status ?? ""] ?? "failed"}`, embed);
  }
  const files = uploads.map((u) => ({ key: u.key, name: u.stem, type: u.type, size: u.bytes.length }));
  const { data: out, error } = await admin.rpc("submit_form_files", { ...base, p_files: files as Json });
  const row = out && typeof out === "object" && !Array.isArray(out) ? (out as { status?: string; files?: { id: string; path: string }[] }) : null;
  if (error || !row) {
    console.error("form submission failed", form.id);
    return back(slug, "error=failed", embed);
  }
  if (row.status !== "ok") return back(slug, `error=${RESULTS[row.status ?? ""] ?? "failed"}`, embed);
  // The database keeps files in the order sent, so rows and uploads line up by index.
  const rows = row.files ?? [];
  const stored: string[] = [];
  let failed = rows.length !== uploads.length;
  for (let i = 0; i < rows.length && !failed; i++) {
    const { error: upErr } = await admin.storage.from(BUCKET).upload(rows[i].path, uploads[i].bytes, { contentType: uploads[i].type, upsert: false });
    if (upErr) failed = true;
    else stored.push(rows[i].id);
  }
  if (failed) {
    console.error("form file upload failed", form.id);
    const ids = rows.map((r) => r.id);
    await admin.from("form_files").update({ status: "failed" }).in("id", ids).eq("form_id", form.id);
    if (stored.length) await admin.storage.from(BUCKET).remove(rows.filter((r) => stored.includes(r.id)).map((r) => r.path));
    return back(slug, "error=failed", embed);
  }
  await admin.from("form_files").update({ status: "stored" }).in("id", stored).eq("form_id", form.id);
  return success(form, slug, embed);
}
