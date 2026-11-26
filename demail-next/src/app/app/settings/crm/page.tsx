import { getOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import Link from "next/link";
import { connectHubSpot, disconnectCrm, dismissSkippedReplies, retrySkippedReplies, saveCrmOptions, syncCrmNow } from "./actions";
const when = (at: string | null) => (at ? `${new Date(at).toISOString().replace("T", " ").slice(0, 16)} UTC` : "Never");
export default async function CrmSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { error, msg } = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  const [{ data: conn }, { data: labels }, { count: linked }, { data: cred }, { count: skipCount }, { data: skips }] = await Promise.all([
    supabase.from("crm_connections").select("*").eq("organization_id", org.id).eq("provider", "hubspot").maybeSingle(),
    supabase.from("labels").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("crm_contact_links").select("contact_id", { count: "exact", head: true }).eq("organization_id", org.id).eq("provider", "hubspot"),
    createAdminClient().from("crm_credentials").select("key_hint").eq("organization_id", org.id).eq("provider", "hubspot").maybeSingle(),
    supabase.from("crm_push_skips").select("message_id", { count: "exact", head: true }).eq("organization_id", org.id).eq("provider", "hubspot"),
    supabase
      .from("crm_push_skips")
      .select("message_id, skipped_at, attempts")
      .eq("organization_id", org.id)
      .eq("provider", "hubspot")
      .order("skipped_at", { ascending: false })
      .limit(20),
  ]);
  const skipIds = (skips ?? []).map((s) => s.message_id);
  const { data: skipMessages } = skipIds.length
    ? await supabase.from("thread_messages").select("id, thread_id, from_email, subject").eq("organization_id", org.id).in("id", skipIds)
    : { data: [] as { id: string; thread_id: string; from_email: string | null; subject: string | null }[] };
  const messageById = new Map((skipMessages ?? []).map((m) => [m.id, m]));
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="CRM" />
      {error && <Alert>{error}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}
      <Card className="flex flex-col gap-3 text-sm">
        <h2 className="font-medium">HubSpot</h2>
        <p>
          Pulls HubSpot contacts into Demail: new contacts are created, empty fields are filled, existing values are never overwritten, and a HubSpot
          unsubscribe unsubscribes the contact here. Pushes every new reply as a note on the HubSpot contact, creating the contact in HubSpot if needed.
        </p>
        <p className="text-slate-600">Reply text is sent to HubSpot. Replies that arrived before you connected are not pushed.</p>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
          <dt className="text-slate-500">Status</dt>
          <dd>{!conn ? "Not connected" : conn.enabled ? "Connected" : "Connected, sync turned off"}</dd>
          {conn && (
            <>
              <dt className="text-slate-500">Token</dt>
              <dd>{cred ? `Ending in ${cred.key_hint}` : "Missing, paste a new one"}</dd>
              <dt className="text-slate-500">Linked contacts</dt>
              <dd>{linked ?? 0}</dd>
              <dt className="text-slate-500">Last sync</dt>
              <dd>{when(conn.last_synced_at)}</dd>
              {conn.last_error && (
                <>
                  <dt className="text-slate-500">Last error</dt>
                  <dd className="text-red-700">{conn.last_error}</dd>
                </>
              )}
            </>
          )}
        </dl>
        {conn && (
          <form action={syncCrmNow}>
            <Button type="submit" variant="secondary">
              Sync now
            </Button>
          </form>
        )}
      </Card>
      {(skipCount ?? 0) > 0 && (
        <Card className="flex flex-col gap-3 text-sm">
          <h2 className="font-medium">Replies not added to HubSpot</h2>
          <p className="text-slate-600">
            HubSpot refused {skipCount} {skipCount === 1 ? "reply" : "replies"}, usually because the contact was deleted there or the address is invalid. They stay
            listed until a retry adds them or an owner or admin dismisses them.
          </p>
          <ul className="flex flex-col divide-y divide-slate-200">
            {(skips ?? []).map((s) => {
              const m = messageById.get(s.message_id);
              return (
                <li key={s.message_id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                  <span className="text-slate-500">{when(s.skipped_at)}</span>
                  <span>{m?.from_email ?? "Unknown sender"}</span>
                  {m ? (
                    <Link href={`/app/unibox/${m.thread_id}`} className="text-sky-700 hover:underline">
                      {m.subject || "(no subject)"}
                    </Link>
                  ) : (
                    <span>(message unavailable)</span>
                  )}
                  <span className="text-slate-500">
                    {s.attempts} {s.attempts === 1 ? "attempt" : "attempts"}
                  </span>
                </li>
              );
            })}
          </ul>
          {canManage && (
            <div className="flex gap-2">
              <form action={retrySkippedReplies}>
                <Button type="submit" variant="secondary">
                  Retry
                </Button>
              </form>
              <form action={dismissSkippedReplies}>
                <Button type="submit" variant="danger">
                  Dismiss
                </Button>
              </form>
            </div>
          )}
        </Card>
      )}
      {canManage && (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="font-medium">{conn ? "Replace the token" : "Connect HubSpot"}</h2>
            <p className="text-sm text-slate-600">
              In HubSpot, open Settings, Integrations, Private apps and create an app with the scopes crm.objects.contacts.read and
              crm.objects.contacts.write. Paste its access token here. The token is sealed before it is stored and is never shown again.
            </p>
            <form action={connectHubSpot} className="flex gap-2">
              <Input type="password" name="token" autoComplete="off" placeholder="Private app access token" required />
              <Button type="submit">{conn ? "Save token" : "Connect"}</Button>
            </form>
          </Card>
          {conn && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-medium">Options</h2>
              <form action={saveCrmOptions} className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="enabled" defaultChecked={conn.enabled} /> Enabled
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="pull_contacts" defaultChecked={conn.pull_contacts} /> Pull contacts
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="push_replies" defaultChecked={conn.push_replies} /> Push replies as notes
                </label>
                <Field label="Label for imported contacts">
                  <Select name="label_id" defaultValue={conn.label_id ?? ""}>
                    <option value="">No label</option>
                    {(labels ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div>
                  <Button type="submit">Save options</Button>
                </div>
              </form>
              <form action={disconnectCrm}>
                <Button type="submit" variant="danger">
                  Disconnect HubSpot
                </Button>
              </form>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
