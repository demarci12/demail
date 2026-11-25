import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendGmail } from "./gmail";
import { sendGraph } from "./graph";
import { MailAuthError } from "./credentials";
import type { MailThread, SendOutcome } from "./types";
type Mailbox = Database["public"]["Tables"]["mailboxes"]["Row"];
// One-to-one mail from the unibox: no unsubscribe footer or headers, OAuth mailboxes only, suppressed recipients refused.
export async function sendManual(
  admin: SupabaseClient<Database>,
  mailbox: Mailbox,
  input: { to: string; subject: string; text: string; thread?: MailThread },
): Promise<SendOutcome> {
  if (mailbox.provider !== "google" && mailbox.provider !== "microsoft") return { ok: false, retryable: false, message: "Only Google and Microsoft mailboxes can send from the unibox" };
  if (mailbox.status !== "active") return { ok: false, retryable: false, message: "This mailbox is not active" };
  const to = input.to.trim().toLowerCase();
  const { data: suppressed } = await admin.from("suppressed_recipients").select("id").eq("organization_id", mailbox.organization_id).eq("email", to).limit(1);
  if (suppressed && suppressed.length > 0) return { ok: false, retryable: false, message: "That address is on the suppression list" };
  const mail = {
    from: mailbox.from_name ? `${mailbox.from_name} <${mailbox.email}>` : mailbox.email,
    to,
    subject: input.subject,
    text: input.text,
    unsubscribeUrl: "",
    oneClickUrl: "",
    idempotencyKey: crypto.randomUUID(),
    thread: input.thread,
    plain: true,
  };
  try {
    return mailbox.provider === "google" ? await sendGmail(admin, mailbox, mail) : await sendGraph(admin, mailbox, mail);
  } catch (e) {
    if (e instanceof MailAuthError) return { ok: false, retryable: false, message: "Reconnect this mailbox first" };
    return { ok: false, retryable: true, message: "Could not reach the mail provider" };
  }
}
