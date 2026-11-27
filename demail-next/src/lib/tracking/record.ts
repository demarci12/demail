import "server-only";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyHit, type HitType, type Verdict } from "./classify";
import { READER_COOKIE } from "./reader";
import { isOwnReader } from "./token";
// Best effort: a failure here must never change what the recipient sees; null when the message is missing or on error.
export async function recordHit(request: NextRequest, messageId: string, type: HitType, url: string | null): Promise<Verdict | null> {
  try {
    const admin = createAdminClient();
    const { data: message } = await admin.from("messages").select("sent_at").eq("id", messageId).maybeSingle();
    if (!message) return null;
    const headers: Record<string, string | undefined> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const userAgent = request.headers.get("user-agent");
    const sentAt = message.sent_at ? new Date(message.sent_at).getTime() : null;
    const verdict = classifyHit({
      type,
      method: request.method,
      userAgent,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      headers,
      msSinceSent: sentAt === null ? null : Date.now() - sentAt,
      ownReader: await isOwnReader(request.cookies.get(READER_COOKIE)?.value),
    });
    await admin.rpc("record_tracking_event", {
      p_message: messageId,
      p_type: type,
      p_url: url,
      p_counted: verdict.counted,
      p_reason: verdict.reason,
      p_ua: userAgent ? userAgent.slice(0, 200) : null,
    });
    return verdict;
  } catch {
    return null;
  }
}
