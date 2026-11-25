"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/org";

const credentials = z.object({ email: z.string().trim().email(), password: z.string().min(8).max(200) });

function back(path: string, next: string, error: string): never {
  const q = new URLSearchParams({ error });
  if (next !== "/app") q.set("next", next);
  redirect(`${path}?${q}`);
}

export async function login(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) back("/login", next, "Enter a valid email and a password of at least 8 characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) back("/login", next, "Wrong email or password.");
  redirect(next);
}

export async function signup(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) back("/signup", next, "Enter a valid email and a password of at least 8 characters.");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) back("/signup", next, error.message);
  if (data.session) redirect(next === "/app" ? "/onboarding" : next);
  redirect("/login?message=" + encodeURIComponent("Check your email to confirm the account, then sign in."));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
