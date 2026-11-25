import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setOrgCookie } from "@/lib/org";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  async function accept() {
    "use server";
    const client = await createClient();
    const { data, error: rpcError } = await client.rpc("accept_invitation", { token });
    if (rpcError || !data) redirect(`/invite/${encodeURIComponent(token)}?error=` + encodeURIComponent("This invitation is invalid, expired, or for a different email address."));
    await setOrgCookie(data);
    redirect("/app");
  }

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Join a workspace</h1>
        <p className="text-sm text-slate-600">Signed in as {auth.user.email}. The invitation must have been sent to this address.</p>
        {error && <Alert>{error}</Alert>}
        <form action={accept}>
          <Button type="submit">Accept invitation</Button>
        </form>
      </Card>
    </main>
  );
}
