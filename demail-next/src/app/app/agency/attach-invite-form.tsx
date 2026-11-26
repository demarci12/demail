"use client";
import { useActionState } from "react";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createAttachInvite, type AttachState } from "./actions";
export function AttachInviteForm() {
  const [state, action, pending] = useActionState<AttachState, FormData>(createAttachInvite, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <Button type="submit" disabled={pending}>
          Create invitation link
        </Button>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.link && (
        <Alert tone="info">
          Send this link to an owner of the workspace (shown once): <input readOnly value={state.link} onFocus={(e) => e.target.select()} className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1 font-mono text-xs" />
        </Alert>
      )}
    </form>
  );
}
