import { getOrgContext } from "@/lib/org";
import { Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { changeRole } from "./actions";
import { InviteForm } from "./invite-form";

export default async function MembersPage() {
  const { supabase, org, user, role, canManage } = await getOrgContext();
  const [{ data: members }, { data: invites }, { data: agencyRows }] = await Promise.all([
    supabase.from("organization_members").select("user_id, role, created_at").eq("organization_id", org.id).order("created_at"),
    supabase.from("invitations").select("id, email, role, expires_at").eq("organization_id", org.id).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
    org.agency_id ? supabase.rpc("workspace_agency", { p_org: org.id }) : Promise.resolve({ data: null }),
  ]);
  const agencyName = agencyRows?.[0]?.agency_name;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Members" />
      {agencyName && <p className="text-sm text-slate-600">Staff of {agencyName} can also open this workspace with their agency role.</p>}
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="pb-2">Member</th>
              <th className="pb-2">Role</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.user_id} className="border-t border-slate-100">
                <td className="py-2 font-mono text-xs">{m.user_id === user.id ? `${user.email} (you)` : m.user_id}</td>
                <td className="py-2">
                  {canManage && m.user_id !== user.id && (m.role !== "owner" || role === "owner") ? (
                    <form action={changeRole} className="flex gap-2">
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <Select name="role" defaultValue={m.role} className="w-32">
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        {role === "owner" && <option value="owner">Owner</option>}
                      </Select>
                      <Button type="submit" variant="secondary">
                        Save
                      </Button>
                    </form>
                  ) : (
                    m.role
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {canManage && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">Invite someone</h2>
          <InviteForm />
          {(invites ?? []).length > 0 && (
            <ul className="mt-2 text-sm text-slate-600">
              {(invites ?? []).map((i) => (
                <li key={i.id}>
                  {i.email} as {i.role}, expires {new Date(i.expires_at).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
