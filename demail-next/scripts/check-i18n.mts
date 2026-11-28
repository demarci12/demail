// Fails when the hu catalog lacks an en key or has a key en does not know.
import { en } from "../src/lib/i18n/en.ts";
import { hu } from "../src/lib/i18n/hu.ts";
const a = Object.keys(en);
const b = Object.keys(hu);
const missing = a.filter((k) => !(k in hu));
const extra = b.filter((k) => !(k in en));
const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
const mismatch = a.filter((k) => k in hu && vars(en[k as keyof typeof en]) !== vars((hu as Record<string, string>)[k]));
const dashes = [...Object.entries(en), ...Object.entries(hu)].filter(([, v]) => /[—–]/.test(v as string)).map(([k]) => k);
for (const [label, list] of [["missing in hu", missing], ["unknown in hu", extra], ["placeholder mismatch", mismatch], ["dash in text", dashes]] as const) {
  if (list.length) console.error(`${label}: ${list.join(", ")}`);
}
if (missing.length || extra.length || mismatch.length || dashes.length) process.exit(1);
console.log(`i18n ok: ${a.length} keys in en and hu`);
