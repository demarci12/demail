import { NextResponse, type NextRequest } from "next/server";
import { recordHit } from "@/lib/tracking/record";
import { verifyOpen } from "@/lib/tracking/token";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 43-byte transparent GIF.
const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
async function handle(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const verified = verifyOpen(token);
  if (verified) await recordHit(request, verified.messageId, "open", null);
  return new NextResponse(request.method === "HEAD" ? null : GIF, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Content-Length": String(GIF.length), "Cache-Control": "no-store, max-age=0" },
  });
}
export const GET = handle;
export const HEAD = handle;
