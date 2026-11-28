import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runVerifyTick } from "@/lib/verify/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runVerifyTick());
  } catch (e) {
    console.error("verify tick failed", e instanceof Error ? e.name : "unknown error");
    return NextResponse.json({ error: "verify_failed" }, { status: 500 });
  }
}

// pg_cron posts; a GET works for manual runs.
export const POST = handle;
export const GET = handle;
