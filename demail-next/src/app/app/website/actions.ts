"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { cleanText, normalizeHostname } from "@/lib/input";
const PATH = "/app/website";
const MAX_TRACKERS = 5;
const uuid = z.string().uuid();
const fail = (message: string): never => redirect(`${PATH}?error=${encodeURIComponent(message)}`);
const done = (message: string): never => {
  revalidatePath(PATH);
  return redirect(`${PATH}?msg=${encodeURIComponent(message)}`);
};
async function manager() {
  const ctx = await getOrgContext();
  if (!ctx.canManage) return fail("Only owners and admins can change website tracking.");
  return ctx;
}
// One domain per line or separated by commas; every entry must be a public hostname.
function domains(formData: FormData): string[] {
  const raw = String(formData.get("domains") ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (raw.length < 1 || raw.length > 10) return fail("List 1 to 10 domains.");
  const out: string[] = [];
  for (const entry of raw) {
    const host = normalizeHostname(entry);
    if (!host) return fail("Domains must be public hostnames like example.com.");
    if (!out.includes(host)) out.push(host);
  }
  return out;
}
function name(formData: FormData) {
  const value = cleanText(formData.get("name"), 100);
  if (!value) return fail("Give the tracker a name of 1 to 100 characters.");
  return value;
}
function whole(formData: FormData, field: string, min: number, max: number, message: string) {
  const raw = String(formData.get(field) ?? "").trim();
  const n = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return fail(message);
  return n;
}
export async function createTracker(formData: FormData) {
  const { supabase, org } = await manager();
  const trackerName = name(formData);
  const list = domains(formData);
  const { count, error: countError } = await supabase.from("site_trackers").select("id", { count: "exact", head: true }).eq("organization_id", org.id);
  if (countError) return fail("Could not create the tracker.");
  if ((count ?? 0) >= MAX_TRACKERS) return fail(`A workspace can have up to ${MAX_TRACKERS} trackers.`);
  const { error } = await supabase.from("site_trackers").insert({ organization_id: org.id, name: trackerName, domains: list });
  if (error) return fail("Could not create the tracker.");
  return done("Tracker created. Add the snippet to your site.");
}
export async function saveTracker(id: string, formData: FormData) {
  if (!uuid.safeParse(id).success) return fail("That tracker no longer exists.");
  const { supabase, org } = await manager();
  const consent = String(formData.get("consent_mode") ?? "");
  if (consent !== "ask" && consent !== "record") return fail("Pick a consent mode.");
  const row = {
    name: name(formData),
    domains: domains(formData),
    consent_mode: consent as "ask" | "record",
    retention_days: whole(formData, "retention_days", 1, 365, "Keep visits for 1 to 365 days."),
    daily_limit: whole(formData, "daily_limit", 1, 50000, "The daily limit is a whole number from 1 to 50000."),
    identify_from_email: formData.get("identify_from_email") === "on",
    enabled: formData.get("enabled") === "on",
  };
  const { data, error } = await supabase.from("site_trackers").update(row).eq("id", id).eq("organization_id", org.id).select("id");
  if (error) return fail("Could not save the tracker.");
  if (!data?.length) return fail("That tracker no longer exists.");
  return done("Tracker saved.");
}
export async function deleteTracker(id: string) {
  if (!uuid.safeParse(id).success) return fail("That tracker no longer exists.");
  const { supabase, org } = await manager();
  const { error } = await supabase.from("site_trackers").delete().eq("id", id).eq("organization_id", org.id);
  if (error) return fail("Could not delete the tracker.");
  return done("Tracker and its visits deleted.");
}
