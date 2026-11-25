import { createHash, randomInt } from "node:crypto";
import type { WarmupThread } from "../types";
import { validateWarmupWording } from "../wording";
import { threads as workPlanning } from "./work-planning";
import { threads as scheduling } from "./scheduling";
import { threads as vendorsAndOrders } from "./vendors-and-orders";
import { threads as eventsAndTravel } from "./events-and-travel";
import { threads as creativeAndCraft } from "./creative-and-craft";
import { threads as everydayLife } from "./everyday-life";

export type LibraryThread = WarmupThread & { key: string };

function keyOf(t: WarmupThread): string {
  return createHash("sha256")
    .update(t.theme + t.subject + t.turns[0])
    .digest("hex")
    .slice(0, 12);
}

function build(): LibraryThread[] {
  const all = [
    ...workPlanning,
    ...scheduling,
    ...vendorsAndOrders,
    ...eventsAndTravel,
    ...creativeAndCraft,
    ...everydayLife,
  ];
  const live = new Set(all.map(keyOf));
  const out: LibraryThread[] = [];
  for (const t of all) {
    const key = keyOf(t);
    if (t.previousKeys?.some((k) => live.has(k))) {
      console.error(`warmup library thread has a previous key that is live: ${key}`);
      continue;
    }
    const bad = [t.subject, ...t.turns].some(
      (text) => !validateWarmupWording(text).ok,
    );
    if (bad) {
      console.error(`warmup library thread refused by wording check: ${key}`);
      continue;
    }
    out.push({ ...t, key });
  }
  return out;
}

export const library: LibraryThread[] = build();

function keysOf(t: LibraryThread): string[] {
  return [t.key, ...(t.previousKeys ?? [])];
}

// Resolves a stored library_key, including one a thread had before an edit.
export function findThread(key: string): LibraryThread | null {
  return library.find((t) => keysOf(t).includes(key)) ?? null;
}

// Prefers a thread not seen recently, else the least recently seen one.
export function pickThread(opts: {
  seenRecently: Set<string>;
  seenEver: Map<string, number>;
}): LibraryThread | null {
  if (library.length === 0) return null;
  const lastSeen = (t: LibraryThread) =>
    Math.max(0, ...keysOf(t).map((k) => opts.seenEver.get(k) ?? 0));
  const fresh = library.filter(
    (t) => !keysOf(t).some((k) => opts.seenRecently.has(k)),
  );
  if (fresh.length > 0) return fresh[randomInt(fresh.length)];
  let best = library[0];
  let bestAt = lastSeen(best);
  for (const t of library) {
    const at = lastSeen(t);
    if (at < bestAt) {
      best = t;
      bestAt = at;
    }
  }
  return best;
}

export function render(
  text: string,
  vars: { to_first: string; from_first: string },
): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, name: string) => {
    if (name === "to_first") return vars.to_first;
    if (name === "from_first") return vars.from_first;
    throw new Error(`unknown placeholder: ${name}`);
  });
}
