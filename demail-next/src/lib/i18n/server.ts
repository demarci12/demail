import "server-only";
import { cookies, headers } from "next/headers";
import { fromAcceptLanguage, isLocale, LOCALE_COOKIE, translator, type Locale, type Translate } from "./index";
// The cookie wins; without one the browser language decides.
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return fromAcceptLanguage((await headers()).get("accept-language"));
}
export async function getT(): Promise<Translate> {
  return translator(await getLocale());
}
