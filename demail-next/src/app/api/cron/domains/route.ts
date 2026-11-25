import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runDomainChecks } from "@/lib/deliverability/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runDomainChecks());
  } catch (e) {
    console.error("domain check tick failed", e instanceof Error ? e.name : "unknown error");
    return NextResponse.json({ error: "domains_failed" }, { status: 500 });
  }
}

// pg_cron posts; a GET works for manual runs.
export const POST = handle;
export const GET = handle;
