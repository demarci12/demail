import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { withHeartbeat } from "@/lib/cron-heartbeat";
import { runFormsTick } from "@/lib/forms/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await withHeartbeat("forms", runFormsTick));
  } catch (e) {
    console.error("forms tick failed", e instanceof Error ? e.name : "unknown error");
    return NextResponse.json({ error: "forms_failed" }, { status: 500 });
  }
}

// pg_cron posts; a GET works for manual runs.
export const POST = handle;
export const GET = handle;
