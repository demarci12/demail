import "server-only";
import { resolveMx } from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { espFromDomain, espFromMx, type Esp } from "./esp";
const FRESH_MS = 30 * 86_400_000;
const TIMEOUT_MS = 3000;
// The recipient's mail host, cached per domain for 30 days. Null when it cannot be told; callers then send from any sender.
export async function recipientEsp(admin: SupabaseClient<Database>, email: string, memo: Map<string, Esp | null>, now: Date): Promise<Esp | null> {
  const domain = email.split("@").pop()?.trim().toLowerCase() ?? "";
  if (!domain) return null;
  if (memo.has(domain)) return memo.get(domain)!;
  let esp: Esp | null = espFromDomain(domain);
  if (!esp) {
    const { data } = await admin.from("recipient_hosts").select("esp, checked_at").eq("domain", domain).maybeSingle();
    if (data && now.getTime() - new Date(data.checked_at).getTime() < FRESH_MS) esp = data.esp as Esp;
    else {
      try {
        const mx = await Promise.race([resolveMx(domain), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns timeout")), TIMEOUT_MS))]);
        esp = espFromMx(mx.map((x) => x.exchange));
        await admin.from("recipient_hosts").upsert({ domain, esp, checked_at: now.toISOString() });
      } catch {
        esp = data ? (data.esp as Esp) : null;
      }
    }
  }
  memo.set(domain, esp);
  return esp;
}
