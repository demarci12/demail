import type { Metadata } from "next";
import { AuthForm } from "../form";
import { signup } from "../actions";
import { safeNext } from "@/lib/org";
import { portalBranding } from "@/lib/portal";
export async function generateMetadata(): Promise<Metadata> {
  const brand = await portalBranding();
  return brand ? { title: brand.brand_name, icons: brand.logo_url ? { icon: brand.logo_url } : undefined } : {};
}
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <AuthForm mode="signup" action={signup} error={sp.error} message={sp.message} next={safeNext(sp.next)} brand={await portalBranding()} />;
}
