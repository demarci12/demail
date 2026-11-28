"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translator, type Locale, type Translate } from "./index";
const Ctx = createContext<Locale>("en");
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}
export function useLocale(): Locale {
  return useContext(Ctx);
}
export function useT(): Translate {
  const locale = useContext(Ctx);
  return useMemo(() => translator(locale), [locale]);
}
