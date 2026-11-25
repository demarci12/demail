import { Field, Input } from "@/components/ui/input";

type Values = { email?: string; first_name?: string | null; last_name?: string | null; company?: string | null; phone?: string | null };

export function ContactFields({ values = {} }: { values?: Values }) {
  return (
    <>
      <Field label="Email">
        <Input name="email" type="email" required defaultValue={values.email ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <Input name="first_name" defaultValue={values.first_name ?? ""} />
        </Field>
        <Field label="Last name">
          <Input name="last_name" defaultValue={values.last_name ?? ""} />
        </Field>
      </div>
      <Field label="Company">
        <Input name="company" defaultValue={values.company ?? ""} />
      </Field>
      <Field label="Phone">
        <Input name="phone" defaultValue={values.phone ?? ""} />
      </Field>
    </>
  );
}
