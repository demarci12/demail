import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/portal";
import { safeNext } from "@/lib/org";

export async function GET(request: NextRequest) {
  // The session cookie is set on this host, so a portal callback returns to the portal.
  const base = await publicOrigin();
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next === "/app" ? "/onboarding" : next, base));
  }
  return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("The confirmation link is invalid or expired."), base));
}
