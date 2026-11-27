import { NextResponse, type NextRequest } from "next/server";
import { recordHit } from "@/lib/tracking/record";
import { verifyClick } from "@/lib/tracking/token";
import { addVisitMatch } from "@/lib/website/match";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const verified = verifyClick(token);
  if (!verified) return new NextResponse(null, { status: 404 });
  let target: URL;
  try {
    target = new URL(verified.url);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return new NextResponse(null, { status: 404 });
  const verdict = await recordHit(request, verified.messageId, "click", target.toString());
  const location = verdict?.counted ? await addVisitMatch(verified.messageId, target) : target;
  return new NextResponse(null, { status: 302, headers: { Location: location.toString(), "Cache-Control": "no-store, max-age=0" } });
}
export const GET = handle;
export const HEAD = handle;
