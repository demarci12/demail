import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { publicEnv } from "@/lib/env";
import { FIELD_TYPES, FIELD_TYPE_LABELS, MAPS_TO, MAPS_TO_LABELS, parseFields, type FormField } from "@/lib/input";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { addField, deleteForm, moveField, removeField, saveForm, updateField } from "../actions";
const textarea = "w-full rounded-md border border-slate-300 bg-white p-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
function FieldControls({ field }: { field?: FormField }) {
  return (
    <>
      <Field label="Label">
        <Input name="label" required maxLength={100} defaultValue={field?.label ?? ""} />
      </Field>
      <Field label="Type">
        <Select name="type" defaultValue={field?.type ?? "text"}>
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Saves to">
        <Select name="maps_to" defaultValue={field?.maps_to ?? "custom"}>
          {MAPS_TO.map((m) => (
            <option key={m} value={m}>
              {MAPS_TO_LABELS[m]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Placeholder">
        <Input name="placeholder" maxLength={100} defaultValue={field?.placeholder ?? ""} />
      </Field>
      <Field label="Dropdown options, one per line">
        <textarea name="options" rows={3} defaultValue={(field?.options ?? []).join("\n")} className={textarea} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" defaultChecked={field?.required ?? false} /> Required
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="page_break" defaultChecked={field?.page_break ?? false} /> Starts a new page
        <span className="text-xs text-slate-500">Ignored on the first field.</span>
      </label>
    </>
  );
}
export default async function FormPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { id } = await params;
  const { error, msg } = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  const { data: form } = await supabase.from("forms").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!form) notFound();
  const [{ data: labels }, { data: campaigns }, { count: submissions }] = await Promise.all([
    supabase.from("labels").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("campaigns").select("id, name, status").eq("organization_id", org.id).order("created_at", { ascending: false }),
    supabase.from("form_submissions").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("form_id", form.id),
  ]);
  const fields = parseFields(form.fields) ?? [];
  const url = `${publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/f/${form.slug}`;
  const embed = `<iframe src="${url}?embed=1" width="100%" height="640" style="border:0" title="Form"></iframe>`;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={form.name}
        actions={
          <Link href={`/app/forms/${form.id}/submissions`} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
            Submissions ({submissions ?? 0})
          </Link>
        }
      />
      <Link href="/app/forms" className="-mt-4 text-sm text-sky-700 hover:underline">
        All forms
      </Link>
      {error && <Alert>{error}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}
      {form.published && (
        <Card className="flex flex-col gap-3 text-sm">
          <h2 className="font-medium">Share</h2>
          <Field label="Hosted link">
            <Input readOnly value={url} />
          </Field>
          <Field label="Embed on your site">
            <textarea readOnly rows={3} value={embed} className={`${textarea} font-mono text-xs`} />
          </Field>
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Settings</h2>
        <form action={saveForm.bind(null, form.id)} className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={form.published} /> Published (anyone with the link can submit)
          </label>
          <Field label="Name (only shown to your team)">
            <Input name="name" required maxLength={100} defaultValue={form.name} />
          </Field>
          <Field label="Title">
            <Input name="title" maxLength={200} defaultValue={form.title} />
          </Field>
          <Field label="Intro">
            <textarea name="intro" rows={3} maxLength={2000} defaultValue={form.intro} className={textarea} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Button text">
              <Input name="submit_label" required maxLength={40} defaultValue={form.submit_label} />
            </Field>
            <Field label="Submissions per day">
              <Input name="daily_limit" type="text" inputMode="numeric" pattern="[0-9]*" required defaultValue={String(form.daily_limit)} />
            </Field>
          </div>
          <Field label="Success message">
            <textarea name="success_message" rows={2} required maxLength={500} defaultValue={form.success_message} className={textarea} />
          </Field>
          <Field label="Consent text (leave blank for no consent box)">
            <textarea name="consent_text" rows={2} maxLength={1000} defaultValue={form.consent_text ?? ""} className={textarea} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Accent color">
              <Input name="accent_color" required pattern="#[0-9a-fA-F]{6}" defaultValue={form.accent_color} />
            </Field>
            <Field label="Layout">
              <Select name="layout" defaultValue={form.layout}>
                <option value="card">Card</option>
                <option value="plain">Plain</option>
              </Select>
            </Field>
            <Field label="Theme">
              <Select name="theme" defaultValue={form.theme ?? "light"}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="soft">Soft</option>
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="focus_mode" defaultChecked={form.focus_mode ?? false} /> Focus mode (one question per screen)
          </label>
          <Field label="Redirect after submit (optional https address)">
            <Input name="redirect_url" type="url" maxLength={500} placeholder="https://example.com/thanks" defaultValue={form.redirect_url ?? ""} />
          </Field>
          <p className="text-xs text-slate-600">
            Visitors go there after a successful submission instead of seeing the success message. Embedded forms show the success message with a Continue link.
          </p>
          <Field label="Label for submitters">
            <Select name="label_id" defaultValue={form.label_id ?? ""}>
              <option value="">No label</option>
              {(labels ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Enroll submitters in a campaign">
            <Select name="campaign_id" defaultValue={form.campaign_id ?? ""}>
              <option value="">Do not enroll</option>
              {(campaigns ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-slate-600">
            Enrollment sends campaign mail to whatever address is typed into the form, using your mailbox limits and sending quota. Addresses are not verified, so
            keep it off for open public forms. Unsubscribed and suppressed contacts are never enrolled.
          </p>
          <div>
            <Button type="submit">Save settings</Button>
          </div>
        </form>
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="font-medium">Fields</h2>
        <ul className="flex flex-col gap-4">
          {fields.map((f, i) => (
            <li key={f.key} className="rounded-md border border-slate-200 p-3">
              <form action={updateField.bind(null, form.id, i)} className="flex flex-col gap-3">
                <p className="text-xs text-slate-500">Key: {f.key}</p>
                <div className="grid grid-cols-2 gap-3">
                  <FieldControls field={f} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="secondary">
                    Save field
                  </Button>
                  <Button type="submit" variant="secondary" formAction={moveField.bind(null, form.id, i, "up")} disabled={i === 0} formNoValidate>
                    Up
                  </Button>
                  <Button type="submit" variant="secondary" formAction={moveField.bind(null, form.id, i, "down")} disabled={i === fields.length - 1} formNoValidate>
                    Down
                  </Button>
                  {f.maps_to !== "email" && (
                    <Button type="submit" variant="danger" formAction={removeField.bind(null, form.id, i)} formNoValidate>
                      Remove
                    </Button>
                  )}
                </div>
              </form>
            </li>
          ))}
        </ul>
        {fields.length < 20 && (
          <form action={addField.bind(null, form.id)} className="flex flex-col gap-3 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-medium">Add a field</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Key (lowercase letters, digits, underscores)">
                <Input name="key" required maxLength={40} pattern="[a-z][a-z0-9_]{0,39}" />
              </Field>
              <FieldControls />
            </div>
            <div>
              <Button type="submit">Add field</Button>
            </div>
          </form>
        )}
      </Card>
      {canManage && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">Delete form</h2>
          <p className="text-sm text-slate-600">Deletes the form and its submissions. Contacts it created stay.</p>
          <form action={deleteForm.bind(null, form.id)}>
            <Button type="submit" variant="danger">
              Delete form
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
