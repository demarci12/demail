import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendMail } from "@/lib/email/resend";
import { MailAuthError } from "./credentials";
import { sendGmail } from "./gmail";
import { sendGraph } from "./graph";
import type { OutgoingMail, SendOutcome } from "./types";

type Mailbox = Database["public"]["Tables"]["mailboxes"]["Row"];

// Dispatches on the mailbox provider; throws MailAuthError when an OAuth mailbox needs reconnecting.
export async function sendThrough(admin: SupabaseClient<Database>, mailbox: Mailbox, mail: OutgoingMail): Promise<SendOutcome> {
  if (mailbox.provider === "google") return guard(() => sendGmail(admin, mailbox, mail));
  if (mailbox.provider === "microsoft") return guard(() => sendGraph(admin, mailbox, mail));
  return sendMail(mail);
}

async function guard(run: () => Promise<SendOutcome>): Promise<SendOutcome> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof MailAuthError) throw e;
    return { ok: false, retryable: true, message: "Could not reach the mail provider" };
  }
}
