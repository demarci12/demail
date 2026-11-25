import { escapeHtml } from "../merge";
export const MAX_TRACKED_URL = 1500;
const HREF = /(<a\b[^>]*?\shref\s*=\s*)(["'])(.*?)\2/gi;
const BARE_URL = /https?:\/\/[^\s<>"']+/g;
const TRAILING = /[.,;:!?)\]}]+$/;
export type LinkWrapper = (url: string) => string;
function unescapeHtml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function trackable(url: string) {
  return /^https?:\/\//i.test(url) && url.length <= MAX_TRACKED_URL && !url.includes("/unsubscribe/") && !url.includes("/api/t/");
}
// Wraps http(s) hrefs; mailto, tel, anchors, long URLs and unsubscribe or tracking links stay as they are.
export function rewriteLinks(html: string, wrap: LinkWrapper) {
  return html.replace(HREF, (all, head: string, quote: string, value: string) => {
    const url = unescapeHtml(value.trim());
    return trackable(url) ? `${head}${quote}${escapeHtml(wrap(url))}${quote}` : all;
  });
}
// Plain text to HTML; with a wrapper, bare URLs become anchors that show the original URL.
export function linkifyPlain(text: string, wrap: LinkWrapper | null) {
  let out = "";
  let last = 0;
  if (wrap) {
    for (const m of text.matchAll(BARE_URL)) {
      const url = m[0].replace(TRAILING, "");
      if (!trackable(url)) continue;
      const at = m.index ?? 0;
      out += `${escapeHtml(text.slice(last, at))}<a href="${escapeHtml(wrap(url))}">${escapeHtml(url)}</a>`;
      last = at + url.length;
    }
  }
  out += escapeHtml(text.slice(last));
  return `<div style="white-space:pre-wrap">${out}</div>`;
}
export function pixelTag(url: string) {
  return `<img src="${escapeHtml(url)}" width="1" height="1" alt="" style="display:none">`;
}
