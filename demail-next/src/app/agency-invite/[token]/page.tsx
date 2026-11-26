import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setOrgCookie } from "@/lib/org";
import { cleanText, displayName } from "@/lib/input";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
export const dynamic = "force-dynamic";
const TOKEN_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID = "This invitation is invalid or expired.";
const ACCEPT_FAILED = "This invitation is invalid or expired, or that workspace cannot join an agency.";
function Invalid() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Join an agency</h1>
        <Alert>{INVALID}</Alert>
      </Card>
    </main>
  );
}
export default async function AgencyInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  if (!TOKEN_RE.test(token)) return <Invalid />;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/agency-invite/${token}`)}`);
  const { data: preview } = await supabase.rpc("agency_attach_preview", { p_token: token });
  const invite = preview?.[0];
  if (!invite) return <Invalid />;
  const agencyName = displayName(invite.agency_name, "an agency");
  const { data: workspaces } = await supabase.rpc("my_workspaces");
  const eligible = (workspaces ?? []).filter((w) => w.role === "owner" && !w.via_agency && !w.is_agency && !w.agency_id);
  async function accept(formData: FormData) {
    "use server";
    const org = String(formData.get("org") ?? "");
    const back = `/agency-invite/${token}?error=${encodeURIComponent(ACCEPT_FAILED)}`;
    if (!TOKEN_RE.test(token) || !UUID_RE.test(org)) redirect(back);
    const client = await createClient();
    const { data, error: rpcError } = await client.rpc("accept_agency_attach", { p_token: token, p_org: org });
    if (rpcError || !data) redirect(back);
    await setOrgCookie(org);
    revalidatePath("/app", "layout");
    redirect(`/app/agency?msg=${encodeURIComponent("This workspace is now managed by the agency.")}`);
  }
  return (
    <main className="mx-auto mt-24 max-w-md px-4">
      <Card className="flex flex-col gap-4 text-sm">
        <h1 className="text-xl font-semibold">Join {agencyName}</h1>
        <p>
          Accepting lets every member of {agencyName} open the workspace you pick with the role they have in the agency, including owners and admins.
          The agency&apos;s branding applies there, and so do the agency&apos;s shared monthly send and AI limits. Your members keep their access. An
          owner can leave the agency at any time from the workspace&apos;s Agency page.
        </p>
        {error && <Alert>{ACCEPT_FAILED}</Alert>}
        {eligible.length === 0 ? (
          <p className="text-slate-600">
            Signed in as {auth.user.email}. You own no workspace that can join an agency. Only an owner of a workspace that is neither an agency nor a
            client of one can accept.
          </p>
        ) : (
          <form action={accept} className="flex flex-col gap-3">
            <Field label="Workspace">
              <Select name="org" required defaultValue={eligible[0].id}>
                {eligible.map((w) => (
                  <option key={w.id} value={w.id}>
                    {cleanText(w.name, 100) || "Workspace"}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <Button type="submit">Accept invitation</Button>
            </div>
          </form>
        )}
      </Card>
    </main>
  );
}
