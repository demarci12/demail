import { Field, Input } from "@/components/ui/input";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Values = { name?: string; timezone?: string; send_days?: number; send_start?: string; send_end?: string; track_opens?: boolean; track_clicks?: boolean; stop_on_reply?: boolean; skip_holidays?: boolean; esp_matching?: boolean };
export function CampaignFields({ values = {} }: { values?: Values }) {
  const days = values.send_days ?? 62;
  return (
    <>
      <Field label="Name">
        <Input name="name" required maxLength={200} defaultValue={values.name ?? ""} />
      </Field>
      <Field label="Timezone (IANA name, for example Europe/Budapest)">
        <Input name="timezone" required defaultValue={values.timezone ?? "UTC"} />
      </Field>
      <div className="flex flex-wrap gap-3 text-sm">
        {DAYS.map((d, i) => (
          <label key={d} className="flex items-center gap-1">
            <input type="checkbox" name="day" value={i} defaultChecked={(days & (1 << i)) !== 0} />
            {d}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Window start">
          <Input name="send_start" type="time" required defaultValue={(values.send_start ?? "08:00").slice(0, 5)} />
        </Field>
        <Field label="Window end">
          <Input name="send_end" type="time" required defaultValue={(values.send_end ?? "18:00").slice(0, 5)} />
        </Field>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="track_opens" defaultChecked={values.track_opens ?? true} />
          Track opens
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="track_clicks" defaultChecked={values.track_clicks ?? true} />
          Track clicks
        </label>
        <p className="text-xs text-slate-500">Tracking is optional. Click tracking rewrites links, which can affect deliverability.</p>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" name="stop_on_reply" defaultChecked={values.stop_on_reply ?? true} />
          Stop on reply
        </label>
        <p className="text-xs text-slate-500">A reply from the contact stops their sequence. Turn it off to branch on replies.</p>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" name="skip_holidays" defaultChecked={values.skip_holidays ?? false} />
          Skip public holidays
        </label>
        <p className="text-xs text-slate-500">A send due on a public holiday of the contact&apos;s country waits for the next working day inside the send window. The country is read from the contact&apos;s country, country_code, location or region field (HU, US, GB, DE, FR, AT). Contacts with no known country are not skipped.</p>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" name="esp_matching" defaultChecked={values.esp_matching ?? false} />
          Match sender to recipient host
        </label>
        <p className="text-xs text-slate-500">A first email to a Google-hosted recipient prefers a Google sender, and Microsoft prefers Microsoft. If no matching sender can send, any available sender is used.</p>
      </div>
    </>
  );
}
