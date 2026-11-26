import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { createClientWorkspace, leaveAgency, openClient, releaseClient, turnIntoAgency, turnOffAgency } from "./actions";
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
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 align-top">
                    <td className="py-2">{c.name}</td>
                    <td className="py-2">{c.contacts}</td>
                    <td className="py-2">{c.active_campaigns}</td>
                    <td className="py-2">{c.sent_7d}</td>
                    <td className="py-2">{c.unread_threads}</td>
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
                ))}
              </tbody>
            </table>
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
    const agencyName = agencyRows?.[0]?.agency_name ?? "an agency";
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
        <p className="text-slate-600">Existing workspaces cannot be attached to an agency. Client workspaces are created from the agency.</p>
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
