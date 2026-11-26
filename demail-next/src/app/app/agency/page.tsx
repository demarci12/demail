import { Fragment } from "react";
import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { displayName } from "@/lib/input";
import {
  createClientWorkspace,
  leaveAgency,
  openClient,
  releaseClient,
  revokeAttachInvite,
  saveAgencyPools,
  saveClientCaps,
  turnIntoAgency,
  turnOffAgency,
} from "./actions";
import { AttachInviteForm } from "./attach-invite-form";
const usageOf = (used: number, limit: number | null | undefined) => (limit ? `${used} of ${limit}` : `${used}, no limit`);
export default async function AgencyPage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { error, msg } = await searchParams;
  const { supabase, org, role, canManage } = await getOrgContext();
  const notices = (
    <>
      {error && <Alert>{error}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}
    </>
  );
  if (org.is_agency) {
    const { data: clients } = await supabase.rpc("agency_clients", { p_agency: org.id });
    const rows = clients ?? [];
    const { data: invites } = canManage
      ? await supabase
          .from("agency_attach_invites")
          .select("id, created_at, expires_at")
          .eq("organization_id", org.id)
          .is("accepted_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : { data: [] };
    const openInvites = invites ?? [];
    const [{ data: pools }, { data: caps }, { data: usage }] = await Promise.all([
      supabase.from("agency_pools").select("monthly_send_pool, monthly_ai_pool, share_ai_key").eq("organization_id", org.id).maybeSingle(),
      supabase.from("agency_client_caps").select("organization_id, monthly_send_cap, monthly_ai_cap").eq("agency_id", org.id),
      supabase.rpc("agency_pool_usage", { p_agency: org.id }),
    ]);
    const capFor = new Map((caps ?? []).map((c) => [c.organization_id, c]));
    const usageFor = new Map((usage ?? []).map((u) => [u.organization_id, u]));
    const sentTotal = (usage ?? []).reduce((n, u) => n + Number(u.sent_this_month), 0);
    const aiTotal = (usage ?? []).reduce((n, u) => n + Number(u.ai_calls_this_month), 0);
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        <PageHeader title="Agency" />
        {notices}
        <Card className="flex flex-col gap-2 text-sm">
          <h2 className="font-medium">How access works</h2>
          <p>
            Every member of {org.name} can open every client workspace with the role they have here: owners stay owners, admins stay admins and
            members stay members. Pick a client in the workspace switcher or press Open to see that workspace as its team does.
          </p>
          <p className="text-slate-600">
            A client workspace can have its own members too. Release needs at least one owner of its own in the client workspace, so no workspace is
            left without an owner.
          </p>
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Client workspaces</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600">No client workspaces yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2">Workspace</th>
                  <th className="pb-2">Contacts</th>
                  <th className="pb-2">Active campaigns</th>
                  <th className="pb-2">Sent in 7 days</th>
                  <th className="pb-2">Unread threads</th>
                  <th className="pb-2">Sent this month</th>
                  <th className="pb-2">AI calls this month</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-t border-slate-100 align-top">
                      <td className="py-2">{displayName(c.name, "Client workspace")}</td>
                      <td className="py-2">{c.contacts}</td>
                      <td className="py-2">{c.active_campaigns}</td>
                      <td className="py-2">{c.sent_7d}</td>
                      <td className="py-2">{c.unread_threads}</td>
                      <td className="py-2">{usageOf(Number(usageFor.get(c.id)?.sent_this_month ?? 0), capFor.get(c.id)?.monthly_send_cap)}</td>
                      <td className="py-2">{usageOf(Number(usageFor.get(c.id)?.ai_calls_this_month ?? 0), capFor.get(c.id)?.monthly_ai_cap)}</td>
                      <td className="py-2">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex gap-2">
                            <form action={openClient.bind(null, c.id)}>
                              <Button type="submit" variant="secondary">
                                Open
                              </Button>
                            </form>
                            {role === "owner" && (
                              <form action={releaseClient.bind(null, c.id)}>
                                <Button type="submit" variant="secondary" disabled={Number(c.direct_owners) === 0}>
                                  Release
                                </Button>
                              </form>
                            )}
                          </div>
                          {role === "owner" && Number(c.direct_owners) === 0 && <span className="text-xs text-slate-500">Needs its own owner to release</span>}
                        </div>
                      </td>
                    </tr>
                    {canManage && (
                      <tr>
                        <td colSpan={8} className="pb-3">
                          <form action={saveClientCaps.bind(null, c.id)} className="flex flex-wrap items-end gap-2">
                            <Field label="Monthly send cap">
                              <Input type="number" name="monthly_send_cap" min={1} max={10000000} placeholder="No limit" defaultValue={capFor.get(c.id)?.monthly_send_cap ?? ""} />
                            </Field>
                            <Field label="Monthly AI cap">
                              <Input type="number" name="monthly_ai_cap" min={1} max={1000000} placeholder="No limit" defaultValue={capFor.get(c.id)?.monthly_ai_cap ?? ""} />
                            </Field>
                            <Button type="submit" variant="secondary">
                              Save caps
                            </Button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="flex flex-col gap-3 text-sm">
          <h2 className="font-medium">Shared limits</h2>
          <p className="text-slate-600">
            This month in UTC. The send pool counts campaign mail sent by {org.name} and every client workspace. The AI pool counts AI calls made
            with this agency&apos;s key, here and by clients. Blank means no limit.
          </p>
          <dl className="grid grid-cols-[12rem_1fr] gap-y-1">
            <dt className="text-slate-500">Campaign mail sent</dt>
            <dd>{usageOf(sentTotal, pools?.monthly_send_pool)}</dd>
            <dt className="text-slate-500">AI calls with the agency key</dt>
            <dd>{usageOf(aiTotal, pools?.monthly_ai_pool)}</dd>
            <dt className="text-slate-500">Key shared with clients</dt>
            <dd>{pools?.share_ai_key ? "Yes" : "No"}</dd>
          </dl>
          {canManage && (
            <form action={saveAgencyPools} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Monthly send pool">
                  <Input type="number" name="monthly_send_pool" min={1} max={10000000} placeholder="No limit" defaultValue={pools?.monthly_send_pool ?? ""} />
                </Field>
                <Field label="Monthly AI pool">
                  <Input type="number" name="monthly_ai_pool" min={1} max={1000000} placeholder="No limit" defaultValue={pools?.monthly_ai_pool ?? ""} />
                </Field>
              </div>
              <label className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <input type="checkbox" name="share_ai_key" defaultChecked={pools?.share_ai_key ?? false} className="h-4 w-4" />
                  Let client workspaces use this agency&apos;s AI key
                </span>
                <span className="pl-6 text-xs text-slate-500">
                  Off by default. Your AI provider bills every call a client makes with it. Calls count toward the AI pool and each client&apos;s AI cap.
                  A client also needs AI turned on.
                </span>
              </label>
              <div>
                <Button type="submit">Save shared limits</Button>
              </div>
            </form>
          )}
        </Card>
        <Card className="flex flex-col gap-2 text-sm">
          <h2 className="font-medium">White-label</h2>
          <p className="text-slate-600">
            Show your brand name, logo, accent color and links instead of Demail in this workspace, every client workspace and their hosted forms.
          </p>
          <p>
            <Link href="/app/settings/branding" className="text-sky-700 underline">
              Open branding
            </Link>
          </p>
        </Card>
        {canManage && (
          <Card className="flex flex-col gap-3">
            <h2 className="font-medium">New client workspace</h2>
            <form action={createClientWorkspace} className="flex items-end gap-2">
              <Field label="Workspace name">
                <Input name="name" required maxLength={80} />
              </Field>
              <Button type="submit">Create</Button>
            </form>
          </Card>
        )}
        {canManage && (
          <Card className="flex flex-col gap-3 text-sm">
            <h2 className="font-medium">Invite an existing workspace</h2>
            <p>
              An owner of that workspace opens the link, picks the workspace and accepts. Every member of {org.name} then opens it with the role they
              have here, and its own members keep their access.
            </p>
            <p className="text-slate-600">Each link works once and expires after 7 days.</p>
            <AttachInviteForm />
            {openInvites.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="pb-2">Created</th>
                    <th className="pb-2">Expires</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {openInvites.map((i) => (
                    <tr key={i.id} className="border-t border-slate-100">
                      <td className="py-2">{new Date(i.created_at).toLocaleDateString()}</td>
                      <td className="py-2">{new Date(i.expires_at).toLocaleDateString()}</td>
                      <td className="py-2 text-right">
                        <form action={revokeAttachInvite.bind(null, i.id)}>
                          <Button type="submit" variant="secondary">
                            Revoke
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
        {role === "owner" && (
          <Card className="flex flex-col gap-3 text-sm">
            <h2 className="font-medium">Turn off agency</h2>
            <p className="text-slate-600">Agency mode can be turned off once no client workspaces are left.</p>
            <form action={turnOffAgency}>
              <Button type="submit" variant="danger" disabled={rows.length > 0}>
                Turn off agency
              </Button>
            </form>
          </Card>
        )}
      </div>
    );
  }
  if (org.agency_id) {
    const { data: agencyRows } = await supabase.rpc("workspace_agency", { p_org: org.id });
    const agencyName = displayName(agencyRows?.[0]?.agency_name, "an agency");
    const { data: poolRows } = await supabase.rpc("workspace_pool_usage", { p_org: org.id });
    const pool = poolRows?.[0];
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <PageHeader title="Agency" />
        {notices}
        <Card className="flex flex-col gap-3 text-sm">
          <h2 className="font-medium">Managed by {agencyName}</h2>
          <p>Staff of {agencyName} can open this workspace with the role they have in the agency.</p>
          <p className="text-slate-600">
            An owner of this workspace can leave the agency. Agency staff then no longer reach it. The workspace needs at least one owner of its own
            first, which you can add from Members.
          </p>
          {role === "owner" && (
            <form action={leaveAgency}>
              <Button type="submit" variant="danger">
                Leave agency
              </Button>
            </form>
          )}
        </Card>
        {pool && (
          <Card className="flex flex-col gap-3 text-sm">
            <h2 className="font-medium">Shared limits</h2>
            <p className="text-slate-600">Set by {agencyName}, counted this month in UTC.</p>
            <dl className="grid grid-cols-[12rem_1fr] gap-y-1">
              <dt className="text-slate-500">Campaign mail sent</dt>
              <dd>{usageOf(Number(pool.sent_this_month), pool.monthly_send_cap)}</dd>
              <dt className="text-slate-500">AI calls with the agency key</dt>
              <dd>{usageOf(Number(pool.ai_calls_this_month), pool.monthly_ai_cap)}</dd>
              <dt className="text-slate-500">Agency AI key</dt>
              <dd>{pool.agency_key_available ? "Available to this workspace" : "Not shared"}</dd>
            </dl>
            {pool.send_pool_reached && (
              <Alert tone="info">The agency&apos;s send pool for this month is used up. Campaign sending waits until next month or until the agency raises it.</Alert>
            )}
            {pool.monthly_send_cap !== null && Number(pool.sent_this_month) >= pool.monthly_send_cap && (
              <Alert tone="info">This workspace&apos;s send cap for this month is reached. Campaign sending waits until next month or until the agency raises it.</Alert>
            )}
            {pool.ai_pool_reached && <Alert tone="info">The agency&apos;s AI pool for this month is used up, so the agency AI key is not used until next month or until the agency raises it.</Alert>}
          </Card>
        )}
      </div>
    );
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Agency" />
      {notices}
      <Card className="flex flex-col gap-3 text-sm">
        <h2 className="font-medium">Run client workspaces from here</h2>
        <p>
          An agency creates a separate workspace for each client. Every member of the agency can open every client workspace with their agency role,
          and the workspace switcher lists the clients so you can see each one as its team does.
        </p>
        <p className="text-slate-600">An agency can also invite an existing workspace. An owner of that workspace opens the invitation link and accepts it.</p>
        {role === "owner" ? (
          <form action={turnIntoAgency}>
            <Button type="submit">Turn into an agency</Button>
          </form>
        ) : (
          <p className="text-slate-600">Only an owner can turn this workspace into an agency.</p>
        )}
      </Card>
    </div>
  );
}
