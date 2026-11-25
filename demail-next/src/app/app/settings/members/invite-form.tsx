"use client";
import { useActionState } from "react";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { createInvite, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvite, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <Field label="Email">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Role">
          <Select name="role" defaultValue="member">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          Create invitation
        </Button>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.link && (
        <Alert tone="info">
          Share this link with the invitee (shown once): <input readOnly value={state.link} onFocus={(e) => e.target.select()} className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1 font-mono text-xs" />
        </Alert>
      )}
    </form>
  );
}
