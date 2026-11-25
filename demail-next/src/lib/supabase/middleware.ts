import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { READER_COOKIE, readerMarker } from "@/lib/tracking/reader";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const protectedPath = path === "/app" || path.startsWith("/app/") || path === "/onboarding" || path.startsWith("/onboarding/");
  if (!data.user && protectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Own-read marker so webmail opens of sent mail in this browser are not counted; browsers that block third-party cookies send nothing.
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (data.user && secret && (path === "/app" || path.startsWith("/app/"))) {
    const marker = await readerMarker(secret);
    if (request.cookies.get(READER_COOKIE)?.value !== marker) {
      const local = request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";
      response.cookies.set(READER_COOKIE, marker, { httpOnly: true, secure: !local, sameSite: local ? "lax" : "none", maxAge: 30 * 86400, path: "/" });
    }
  }
  return response;
}
