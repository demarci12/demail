import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runSendTick } from "@/lib/send/run";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Hashing first gives equal-length buffers, so the comparison is constant time.
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}
async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runSendTick());
  } catch (e) {
    console.error("send tick failed", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
// pg_cron posts; the Vercel daily cron fallback issues a GET.
export const POST = handle;
export const GET = handle;
