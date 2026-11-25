import { AuthForm } from "../form";
import { signup } from "../actions";
import { safeNext } from "@/lib/org";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <AuthForm mode="signup" action={signup} error={sp.error} message={sp.message} next={safeNext(sp.next)} />;
}
