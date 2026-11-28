"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "./index";
// Returns to the page the switch was clicked on; only a same-host referer counts.
async function backPath(): Promise<string> {
  const h = await headers();
  try {
    const url = new URL(h.get("referer") ?? "");
    if (url.host === h.get("host")) return url.pathname + url.search;
  } catch {}
  return "/";
}
export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (isLocale(locale)) {
    (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  }
  redirect(await backPath());
}
