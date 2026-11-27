import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/forms/token";
import { cleanPath, isPublicHostname, normalizeHostname } from "@/lib/input";
import { createAdminClient } from "@/lib/supabase/admin";
import { BOT_AGENTS } from "@/lib/tracking/classify";
import { READER_COOKIE } from "@/lib/tracking/reader";
import { isOwnReader } from "@/lib/tracking/token";
import { siteBucket, verifyVisitMatch } from "@/lib/website/token";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY = 4096;
const KEY_RE = /^[0-9a-f]{24}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The same empty answer for every outcome, so the endpoint reveals nothing about keys or domains.
function done() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
function originHost(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return null;
  try {
    const u = new URL(origin);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}
export function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
export async function POST(req: NextRequest) {
  const length = req.headers.get("content-length");
  if (length === null) return new NextResponse(null, { status: 411 });
  if (!/^\d+$/.test(length) || Number(length) > MAX_BODY) return new NextResponse(null, { status: 413 });
  const host = originHost(req);
  if (!host || !isPublicHostname(host)) return done();
  if (req.headers.get("sec-gpc")?.trim() === "1") return done();
  const ua = req.headers.get("user-agent")?.trim() ?? "";
  if (!ua || BOT_AGENTS.some((r) => r.test(ua))) return done();
  if (await isOwnReader(req.cookies.get(READER_COOKIE)?.value)) return done();
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return done();
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return done();
    body = parsed as Record<string, unknown>;
  } catch {
    return done();
  }
  const key = typeof body.k === "string" && KEY_RE.test(body.k) ? body.k : null;
  const visitor = typeof body.v === "string" && UUID.test(body.v) ? body.v : null;
  const path = cleanPath(body.p);
  if (!key || !visitor || !path) return done();
  const referrer = typeof body.r === "string" ? normalizeHostname(body.r) : null;
  const message = body.m === undefined || body.m === null ? null : verifyVisitMatch(body.m);
  try {
    const { error } = await createAdminClient().rpc("record_site_view", {
      p_key: key,
      p_bucket: siteBucket(key, clientIp(req)),
      p_visitor: visitor,
      p_host: host,
      p_path: path,
      p_referrer: referrer,
      p_consented: body.c === true,
      p_message: message,
    });
    if (error) console.error("site view not recorded");
  } catch {
    console.error("site view not recorded");
  }
  return done();
}
