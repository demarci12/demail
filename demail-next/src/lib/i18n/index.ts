import { en, type MessageKey } from "./en";
import { hu } from "./hu";
export type { MessageKey };
export const LOCALES = ["en", "hu"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "demail_locale";
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", hu: "Magyar" };
const catalogs: Record<Locale, Partial<Record<MessageKey, string>>> = { en, hu };
export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
// A key missing from the locale falls back to English; {name} placeholders are filled from vars.
export function translator(locale: Locale): Translate {
  return (key, vars) => {
    const text = catalogs[locale][key] ?? en[key];
    return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (Object.hasOwn(vars, k) ? String(vars[k]) : m)) : text;
  };
}
// Picks the first supported language of an Accept-Language header.
export function fromAcceptLanguage(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase().slice(0, 2);
    if (isLocale(tag)) return tag;
  }
  return "en";
}
