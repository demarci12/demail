"use client";
import { useActionState } from "react";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { createConnectLink, type ConnectLinkState } from "./actions";
export function ConnectLinkForm() {
  const [state, action, pending] = useActionState<ConnectLinkState, FormData>(createConnectLink, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Label">
          <Input name="label" maxLength={80} placeholder="Client name" />
        </Field>
        <Field label="Valid for (days)">
          <Input name="days" type="number" min={1} max={30} defaultValue={7} required />
        </Field>
        <Field label="Mailboxes">
          <Input name="max_uses" type="number" min={1} max={50} defaultValue={1} required />
        </Field>
        <Button type="submit" disabled={pending}>
          Create link
        </Button>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.link && (
        <Alert tone="info">
          Share this link with your client (shown once): <input readOnly value={state.link} onFocus={(e) => e.target.select()} className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1 font-mono text-xs" />
        </Alert>
      )}
    </form>
  );
}
