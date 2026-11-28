import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { withHeartbeat } from "@/lib/cron-heartbeat";
import { runSendTick } from "@/lib/send/run";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await withHeartbeat("send", runSendTick));
  } catch (e) {
    console.error("send tick failed", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
// pg_cron posts; the Vercel daily cron fallback issues a GET.
export const POST = handle;
export const GET = handle;
