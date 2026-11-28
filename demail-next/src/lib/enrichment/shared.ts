// Pure helpers with no imports, so the check script can load this file directly.
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  // Providers return placeholders such as email_not_unlocked@domain.com for values they hold back.
  if (v.length > 320 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(v) || v.startsWith("email_not_unlocked@")) return null;
  return v;
}
export function cleanPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return /^\+?[0-9][0-9 ()\-.]{5,29}$/.test(v) && v.replace(/\D/g, "").length >= 7 ? v : null;
}
