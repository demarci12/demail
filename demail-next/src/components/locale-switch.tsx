import { getLocale } from "@/lib/i18n/server";
import { setLocale } from "@/lib/i18n/actions";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
export async function LocaleSwitch() {
  const current = await getLocale();
  return (
    <form action={setLocale} className="flex gap-2 text-xs" aria-label={LOCALE_NAMES[current]}>
      {LOCALES.map((l) => (
        <button key={l} type="submit" name="locale" value={l} lang={l} aria-current={l === current ? "true" : undefined} className={l === current ? "font-semibold text-slate-900" : "text-slate-500 hover:text-slate-800"}>
          {l.toUpperCase()}
        </button>
      ))}
    </form>
  );
}
