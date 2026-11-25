import { NextResponse } from "next/server";
import { applyUnsubscribe } from "@/lib/unsubscribe-apply";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// RFC 8058 one-click: mail clients POST here without a session.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await applyUnsubscribe(token);
  return NextResponse.json({ unsubscribed: ok }, { status: ok ? 200 : 400 });
}
