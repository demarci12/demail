import { getOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiEnv } from "@/lib/env";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "@/lib/ai/shared";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { removeAiKey, saveAiKey, saveAiSettings, testAi } from "./actions";
export default async function AiSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { error, msg } = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: settings }, { data: usage }, { data: cred }, { data: poolRows }] = await Promise.all([
    supabase.from("ai_settings").select("*").eq("organization_id", org.id).maybeSingle(),
    supabase.from("ai_usage").select("source, calls").eq("organization_id", org.id).eq("day", today),
    createAdminClient().from("ai_credentials").select("key_hint").eq("organization_id", org.id).maybeSingle(),
    org.agency_id ? supabase.rpc("workspace_pool_usage", { p_org: org.id }) : Promise.resolve({ data: [] }),
  ]);
  const agencyKey = !!poolRows?.[0]?.agency_key_available;
  const instanceKey = !!aiEnv().AI_API_KEY;
  const enabled = settings?.enabled ?? false;
  const limit = settings?.daily_call_limit ?? 100;
  const callsToday = (usage ?? []).reduce((n, u) => n + u.calls, 0);
  const keySource = cred ? `Workspace key ending in ${cred.key_hint}` : agencyKey ? "Your agency's shared key" : instanceKey ? "This instance's shared key" : "No key";
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="AI" />
      {error && <Alert>{error}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}
      <Card className="flex flex-col gap-3 text-sm">
        <p>
          AI is off until an owner or admin turns it on. Your provider may charge for every call, and each call counts toward the daily limit. Nothing
          written by AI is sent until a member sends it.
        </p>
        <p className="text-slate-600">Reply text and your brief are sent to the AI provider you configure.</p>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
          <dt className="text-slate-500">Status</dt>
          <dd>{enabled ? "On" : "Off"}</dd>
          <dt className="text-slate-500">Reply classification</dt>
          <dd>{enabled && settings?.classify_replies ? "On" : "Off"}</dd>
          <dt className="text-slate-500">Key</dt>
          <dd>{keySource}</dd>
          <dt className="text-slate-500">Calls today (UTC)</dt>
          <dd>
            {callsToday} of {limit}
          </dd>
        </dl>
      </Card>
      {canManage && (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="font-medium">Settings</h2>
            <form action={saveAiSettings} className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={enabled} /> Enabled
              </label>
              <label className="flex flex-col gap-0.5 text-sm">
                <span className="flex items-center gap-2">
                  <input type="checkbox" name="classify_replies" defaultChecked={settings?.classify_replies ?? false} /> Classify incoming replies with AI
                </span>
                <span className="pl-6 text-xs text-slate-500">Calls the provider once for each new reply, without a click. Only replies that arrive after you turn it on are read.</span>
              </label>
              <Field label="Base URL">
                <Input name="base_url" defaultValue={settings?.base_url ?? ""} placeholder={DEFAULT_AI_BASE_URL} />
              </Field>
              <p className="-mt-2 text-xs text-slate-500">
                Used with a workspace key. It must be a public https URL. A local model needs the instance AI_BASE_URL set by the operator.
              </p>
              <Field label="Model">
                <Input name="model" defaultValue={settings?.model ?? ""} placeholder={DEFAULT_AI_MODEL} maxLength={100} />
              </Field>
              <Field label="Daily call limit">
                <Input type="number" name="daily_call_limit" min={1} max={5000} defaultValue={limit} required />
              </Field>
              <div>
                <Button type="submit">Save settings</Button>
              </div>
            </form>
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="font-medium">Workspace key</h2>
            <p className="text-sm text-slate-600">
              The key is sealed before it is stored and is never shown again. Only its last four characters are kept for display.
            </p>
            <form action={saveAiKey} className="flex gap-2">
              <Input type="password" name="api_key" autoComplete="off" placeholder="API key" required />
              <Button type="submit">Save key</Button>
            </form>
            <div className="flex gap-2">
              {cred && (
                <form action={removeAiKey}>
                  <Button type="submit" variant="danger">
                    Remove key
                  </Button>
                </form>
              )}
              <form action={testAi}>
                <Button type="submit" variant="secondary">
                  Send a test prompt
                </Button>
              </form>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
