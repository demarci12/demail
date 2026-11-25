import { randomBytes } from "node:crypto";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
// A per-mailbox marker the owner can filter on, `dm-` plus 8 base32 characters.
export function newFilterTag(): string {
  const bytes = randomBytes(8);
  return "dm-" + Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
}
