import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPortal } from "@/lib/portal";

export default async function Home() {
  if (await currentPortal()) redirect("/login");
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-10">
      <h1 className="text-2xl font-semibold">Demail</h1>
      <p className="text-slate-600">Cold email outreach you host yourself on Supabase, Resend and Vercel.</p>
      <Link href="/login" className="text-sky-700 underline">
        Sign in
      </Link>
    </main>
  );
}
