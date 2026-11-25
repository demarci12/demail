import { randomBytes, randomUUID } from "node:crypto";
import type { OutgoingMail } from "./types";

// Header values never keep CR, LF or other control characters.
function clean(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function encodeWord(value: string) {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (Buffer.byteLength(chunk + ch) > 42) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString("base64")}?=`).join("\r\n ");
}

export function parseAddress(value: string) {
  const match = /^(.*)<([^<>]+)>\s*$/.exec(value);
  const address = clean(match ? match[2] : value);
  const name = match ? clean(match[1]).replace(/^"|"$/g, "").replace(/["\\]/g, "") : "";
  return { name, address };
}

function formatAddress(value: string) {
  const { name, address } = parseAddress(value);
  if (!name) return address;
  const encoded = encodeWord(name);
  return /^[\x20-\x7e]*$/.test(name) ? `"${encoded}" <${address}>` : `${encoded} <${address}>`;
}

function base64Lines(value: string) {
  return (Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

// Builds a multipart/alternative RFC 5322 message and returns it with its Message-ID.
export function buildMime(mail: OutgoingMail, domain: string, includeUnsubscribeHeaders = true) {
  const messageId = `<${randomUUID()}@${clean(domain)}>`;
  const boundary = `demail_${randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${formatAddress(mail.from)}`,
    `To: ${formatAddress(mail.to)}`,
    ...(mail.replyTo ? [`Reply-To: ${formatAddress(mail.replyTo)}`] : []),
    `Subject: ${encodeWord(clean(mail.subject))}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${messageId}`,
    ...(mail.thread?.inReplyToRfcId ? [`In-Reply-To: ${clean(mail.thread.inReplyToRfcId)}`] : []),
    ...(mail.thread && mail.thread.references.length ? [`References: ${mail.thread.references.map(clean).join(" ")}`] : []),
    ...(includeUnsubscribeHeaders ? [`List-Unsubscribe: <${clean(mail.oneClickUrl)}>`, "List-Unsubscribe-Post: List-Unsubscribe=One-Click"] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(mail.text),
    ...(mail.html ? [`--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64Lines(mail.html)] : []),
    `--${boundary}--`,
    "",
  ];
  return { raw: `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`, messageId };
}
