// Public holidays by country, computed from rules so no year table goes stale. Not listed: regional holidays and bridge days.
// To add a country: add its ISO 3166-1 alpha-2 code to HOLIDAYS with a rule list, and its common names to COUNTRY_NAMES.
type Ymd = { y: number; m: number; d: number };
type Rule = (year: number) => [month: number, day: number][];
const DAY_MS = 86_400_000;
function easter(y: number): number {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}
const fromEaster = (offset: number): Rule => (y) => {
  const t = new Date(easter(y) + offset * DAY_MS);
  return [[t.getUTCMonth() + 1, t.getUTCDate()]];
};
const fixed = (month: number, day: number): Rule => () => [[month, day]];
// nth weekday (0 = Sunday) of a month; n = -1 is the last one.
const nthWeekday = (month: number, weekday: number, n: number): Rule => (y) => {
  if (n > 0) {
    const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
    return [[month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7]];
  }
  const lastDate = new Date(Date.UTC(y, month, 0));
  return [[month, lastDate.getUTCDate() - ((lastDate.getUTCDay() - weekday + 7) % 7)]];
};
const all = (...rules: Rule[]): Rule => (y) => rules.flatMap((r) => r(y));
const easterMonday = fromEaster(1);
const goodFriday = fromEaster(-2);
const ascension = fromEaster(39);
const whitMonday = fromEaster(50);
// A fixed-date holiday on a weekend is observed on the nearest weekday (US) or the next free Monday (GB).
function observedUs(month: number, day: number): Rule {
  return (y) => {
    const dow = new Date(Date.UTC(y, month - 1, day)).getUTCDay();
    const t = new Date(Date.UTC(y, month - 1, day + (dow === 6 ? -1 : dow === 0 ? 1 : 0)));
    // shortcut: a 1 January on a Saturday is not moved to 31 December of the year before; fine for business mail.
    return t.getUTCFullYear() === y ? [[t.getUTCMonth() + 1, t.getUTCDate()]] : [];
  };
}
const gbBank: Rule = (y) => {
  const taken = new Set<number>([...goodFriday(y), ...easterMonday(y), ...nthWeekday(5, 1, 1)(y), ...nthWeekday(5, 1, -1)(y), ...nthWeekday(8, 1, -1)(y)].map(([m, d]) => Date.UTC(y, m - 1, d)));
  const out: [number, number][] = [];
  for (const [m, d] of [[1, 1], [12, 25], [12, 26]] as const) {
    let t = Date.UTC(y, m - 1, d);
    while ([0, 6].includes(new Date(t).getUTCDay()) || taken.has(t)) t += DAY_MS;
    taken.add(t);
    out.push([new Date(t).getUTCMonth() + 1, new Date(t).getUTCDate()]);
  }
  return out;
};
export const HOLIDAYS: Record<string, Rule> = {
  HU: all(fixed(1, 1), fixed(3, 15), goodFriday, fromEaster(0), easterMonday, fromEaster(49), whitMonday, fixed(5, 1), fixed(8, 20), fixed(10, 23), fixed(11, 1), fixed(12, 25), fixed(12, 26)),
  US: all(observedUs(1, 1), nthWeekday(1, 1, 3), nthWeekday(2, 1, 3), nthWeekday(5, 1, -1), observedUs(6, 19), observedUs(7, 4), nthWeekday(9, 1, 1), nthWeekday(10, 1, 2), observedUs(11, 11), nthWeekday(11, 4, 4), observedUs(12, 25)),
  GB: all(gbBank, goodFriday, easterMonday, nthWeekday(5, 1, 1), nthWeekday(5, 1, -1), nthWeekday(8, 1, -1)),
  DE: all(fixed(1, 1), goodFriday, easterMonday, fixed(5, 1), ascension, whitMonday, fixed(10, 3), fixed(12, 25), fixed(12, 26)),
  FR: all(fixed(1, 1), easterMonday, fixed(5, 1), fixed(5, 8), ascension, whitMonday, fixed(7, 14), fixed(8, 15), fixed(11, 1), fixed(11, 11), fixed(12, 25)),
  AT: all(fixed(1, 1), fixed(1, 6), easterMonday, fixed(5, 1), ascension, whitMonday, fromEaster(60), fixed(8, 15), fixed(10, 26), fixed(11, 1), fixed(12, 8), fixed(12, 25), fixed(12, 26)),
};
export const HOLIDAY_COUNTRIES = Object.keys(HOLIDAYS);
const COUNTRY_NAMES: Record<string, string> = {
  hungary: "HU", magyarorszag: "HU", "magyarország": "HU",
  "united states": "US", "united states of america": "US", usa: "US", america: "US",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", england: "GB", britain: "GB",
  germany: "DE", deutschland: "DE", france: "FR", austria: "AT", "österreich": "AT", osterreich: "AT",
};
const FIELDS = ["country_code", "country", "location", "region"];
// The recipient country from a contact's custom fields: an ISO code or a name, or the last part of "City, Country". Null when unknown.
export function contactCountry(custom: unknown): string | null {
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return null;
  const byKey = new Map(Object.entries(custom as Record<string, unknown>).map(([k, v]) => [k.trim().toLowerCase(), v]));
  for (const key of FIELDS) {
    const v = byKey.get(key);
    if (typeof v !== "string") continue;
    const part = (v.split(",").pop() ?? "").trim();
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase() === "UK" ? "GB" : part.toUpperCase();
    const name = COUNTRY_NAMES[part.toLowerCase()];
    if (name) return name;
  }
  return null;
}
export function isHoliday(country: string | null, { y, m, d }: Ymd): boolean {
  const rule = country ? HOLIDAYS[country] : undefined;
  return !!rule && rule(y).some(([hm, hd]) => hm === m && hd === d);
}
