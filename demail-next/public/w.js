// Demail website tracking snippet: records nothing before consent in ask mode and nothing at all under Global Privacy Control.
(function () {
  "use strict";
  const script = document.currentScript;
  const stub = window.demail;
  const queued = stub && Array.isArray(stub.q) ? stub.q.slice() : [];
  if (!script || navigator.globalPrivacyControl === true) {
    window.demail = function () {
      return undefined;
    };
    return;
  }
  const key = script.getAttribute("data-key") || "";
  const mode = script.getAttribute("data-consent") === "record" ? "record" : "ask";
  let endpoint = "";
  try {
    endpoint = new URL("/api/w/v", script.src).toString();
  } catch {
    endpoint = "";
  }
  function read(name) {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  }
  function write(name, value) {
    try {
      if (value === null) window.localStorage.removeItem(name);
      else window.localStorage.setItem(name, value);
    } catch {
      return;
    }
  }
  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    const b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  let match = null;
  try {
    const url = new URL(window.location.href);
    const dm = url.searchParams.get("dm");
    if (dm) {
      match = dm.slice(0, 200);
      url.searchParams.delete("dm");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  } catch {
    match = null;
  }
  let consent = read("demail_consent");
  let visitor = null;
  let pageSent = false;
  function allowed() {
    return mode === "ask" ? consent === "1" : consent !== "0";
  }
  function post(body) {
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }))) return;
    } catch {
      // Fall through to fetch.
    }
    try {
      fetch(endpoint, { method: "POST", body, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } }).catch(() => undefined);
    } catch {
      return;
    }
  }
  function view() {
    if (!endpoint || !key || !allowed()) return;
    pageSent = true;
    visitor = visitor || read("demail_vid");
    if (!visitor) {
      visitor = newId();
      write("demail_vid", visitor);
    }
    let ref = null;
    try {
      const r = document.referrer ? new URL(document.referrer).hostname : "";
      if (r && r !== window.location.hostname) ref = r;
    } catch {
      ref = null;
    }
    const body = { k: key, v: visitor, p: window.location.pathname, c: consent === "1" };
    if (ref) body.r = ref;
    if (match) body.m = match;
    match = null;
    post(JSON.stringify(body));
  }
  function demail(command, value) {
    if (command === "consent") {
      if (value === true) {
        consent = "1";
        write("demail_consent", "1");
        if (!pageSent) view();
      } else if (value === false) {
        consent = "0";
        visitor = null;
        match = null;
        write("demail_consent", "0");
        write("demail_vid", null);
      }
    } else if (command === "page") {
      pageSent = false;
      view();
    }
  }
  window.demail = demail;
  for (const args of queued) demail(args[0], args[1]);
  if (!pageSent) view();
})();
