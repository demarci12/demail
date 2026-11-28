import { cleanText, isSafeAnswer } from "@/lib/input";

// Limits sit under Vercel's 4.5 MB request body limit; migration 003810 repeats them in the bucket and the table.
export const FILE_MAX_BYTES = 3_000_000;
export const FILE_BODY_MAX_BYTES = 4_000_000;
export const FILE_TYPES = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "image/png": { ext: "png", label: "PNG" },
  "image/jpeg": { ext: "jpg", label: "JPEG" },
  "image/webp": { ext: "webp", label: "WebP" },
  "text/plain": { ext: "txt", label: "Text" },
} as const;
export type FileType = keyof typeof FILE_TYPES;
export const FILE_ACCEPT = Object.values(FILE_TYPES)
  .map((t) => `.${t.ext}`)
  .join(",");

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

// The type comes from the bytes, never from the browser's claim or the file name.
export function sniffFileType(bytes: Uint8Array): FileType | null {
  if (bytes.length === 0 || bytes.length > FILE_MAX_BYTES) return null;
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Plain text only: no NUL or other control characters besides tab and line breaks.
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) ? null : "text/plain";
  } catch {
    return null;
  }
}

// The stored name is the stem of the uploaded name: no path, no extension, no links or markup; the extension is shown from the checked type.
export function safeFileStem(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const stem = cleanText(base.replace(/\.[^.]*$/, ""), 80);
  return stem && isSafeAnswer(stem) ? stem : "file";
}

export function fileDisplayName(stem: string, type: string) {
  const known = Object.hasOwn(FILE_TYPES, type) ? FILE_TYPES[type as FileType] : null;
  return known ? `${stem}.${known.ext}` : stem;
}
