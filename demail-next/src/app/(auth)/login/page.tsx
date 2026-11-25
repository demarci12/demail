import { AuthForm } from "../form";
import { login } from "../actions";
import { safeNext } from "@/lib/org";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <AuthForm mode="login" action={login} error={sp.error} message={sp.message} next={safeNext(sp.next)} />;
}
