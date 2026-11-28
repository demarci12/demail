import { getOrgContext } from "@/lib/org";
import { redirect } from "next/navigation";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { createAdminClient } from "@/lib/supabase/admin";
import { addProvider, moveProvider, removeProvider, saveEnrichmentSettings, toggleProvider } from "./actions";

type Row = { id: string; role: string; kind: string; label: string; base_url: string | null; enabled: boolean };
const KIND_NAME: Record<string, string> = { hunter: "Hunter", apollo: "Apollo", millionverifier: "MillionVerifier", http: "Generic HTTP" };

function ProviderList({ rows, hints, canManage }: { rows: Row[]; hints: Map<string, string>; canManage: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">None yet.</p>;
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {rows.map((p, i) => (
        <li key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 px-3 py-2">
          <span className="w-5 text-slate-400">{i + 1}.</span>
          <span className="font-medium">{p.label}</span>
          <span className="text-slate-500">
            {KIND_NAME[p.kind] ?? p.kind}, key ending in {hints.get(p.id) ?? "?"}
            {p.base_url ? `, ${p.base_url}` : ""}
          </span>
          {!p.enabled && <span className="text-amber-700">Off</span>}
          {canManage && (
            <span className="ml-auto flex gap-1">
              <form action={moveProvider.bind(null, p.id, "up")}>
                <Button type="submit" variant="secondary" disabled={i === 0}>
                  Up
                </Button>
              </form>
              <form action={moveProvider.bind(null, p.id, "down")}>
                <Button type="submit" variant="secondary" disabled={i === rows.length - 1}>
                  Down
                </Button>
              </form>
              <form action={toggleProvider.bind(null, p.id)}>
                <Button type="submit" variant="secondary">
                  {p.enabled ? "Turn off" : "Turn on"}
                </Button>
              </form>
              <form action={removeProvider.bind(null, p.id)}>
                <Button type="submit" variant="danger">
                  Remove
                </Button>
              </form>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function AddForm({ role, kinds }: { role: "enrich" | "verify"; kinds: string[] }) {
  return (
    <form action={addProvider} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
      <input type="hidden" name="role" value={role} />
      <div className="flex flex-wrap gap-2">
        <Select name="kind" defaultValue={kinds[0]} aria-label="Provider type" className="w-48">
          {kinds.map((k) => (
            <option key={k} value={k}>
              {KIND_NAME[k]}
            </option>
          ))}
        </Select>
        <Input name="label" placeholder="Name (optional)" maxLength={60} className="w-48" />
        <Input type="password" name="api_key" autoComplete="off" placeholder="API key" required className="w-64" />
      </div>
      <Input name="base_url" placeholder="Generic HTTP only: https://api.example.com/find" maxLength={300} />
      <div>
        <Button type="submit" variant="secondary">
          Add provider
        </Button>
      </div>
    </form>
  );
}

export default async function EnrichmentSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { error, msg } = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) redirect("/app");
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: settings }, { data: usage }, { data: providers }, { data: creds }] = await Promise.all([
    supabase.from("enrichment_settings").select("*").eq("organization_id", org.id).maybeSingle(),
    supabase.from("enrichment_usage").select("calls").eq("organization_id", org.id).eq("day", today).maybeSingle(),
    supabase.from("enrichment_providers").select("id, role, kind, label, base_url, enabled").eq("organization_id", org.id).order("position").order("created_at"),
    createAdminClient().from("enrichment_credentials").select("provider_id, key_hint").eq("organization_id", org.id),
  ]);
  const hints = new Map((creds ?? []).map((c) => [c.provider_id, c.key_hint]));
  const rows = providers ?? [];
  const enabled = settings?.enabled ?? false;
  const limit = settings?.daily_call_limit ?? 100;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Enrichment" />
      {error && <Alert>{error}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}
      <Card className="flex flex-col gap-3 text-sm">
        <p>
          Enrichment is off until you turn it on, and Demail runs fine without it. Each provider call may cost money at the provider. Nothing runs by itself: a member
          starts a run with a click on selected contacts (contacts list) or on a segment, and every call counts toward the daily cap below.
        </p>
        <p className="text-slate-600">Names, companies and email addresses of the picked contacts are sent to the providers you add.</p>
        <p>
          Status: {enabled ? "On" : "Off"}. Calls today (UTC): {usage?.calls ?? 0} of {limit}.
        </p>
        <form action={saveEnrichmentSettings} className="flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="enabled" defaultChecked={enabled} /> Enabled
          </label>
          <Field label="Daily call cap">
            <Input type="number" name="daily_call_limit" min={1} max={5000} defaultValue={limit} required className="w-40" />
          </Field>
          <div>
            <Button type="submit">Save settings</Button>
          </div>
        </form>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Waterfall: email and phone finders</h2>
        <p className="text-sm text-slate-600">
          Tried in this order. A provider is called only when the ones above it found nothing for that field. Found values keep their source and time, and an existing phone is never
          overwritten. A found email is stored beside the contact, never in place of its address. Hunter finds emails only; Apollo finds emails and phones. Generic HTTP posts
          first_name, last_name, company and domain as JSON with a Bearer key and expects {"{ email, phone }"} back.
        </p>
        <ProviderList rows={rows.filter((r) => r.role === "enrich")} hints={hints} canManage={canManage} />
        {canManage && <AddForm role="enrich" kinds={["hunter", "apollo", "http"]} />}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Consensus verification</h2>
        <p className="text-sm text-slate-600">
          Two or three providers vote on an address, after the built-in check. An address becomes valid only when they agree; otherwise it is risky, with a catch-all flag when a
          provider says so. It is never weaker than the built-in result: an invalid address stays invalid. Only the first three enabled providers are asked. Generic HTTP posts
          {" { email }"} as JSON with a Bearer key and expects {"{ status }"} with valid, invalid, risky, catch_all or unknown.
        </p>
        <ProviderList rows={rows.filter((r) => r.role === "verify")} hints={hints} canManage={canManage} />
        {canManage && <AddForm role="verify" kinds={["millionverifier", "http"]} />}
      </Card>
    </div>
  );
}
