const TONE: Record<string, string> = {
  valid: "border-emerald-200 bg-emerald-50 text-emerald-800",
  risky: "border-amber-200 bg-amber-50 text-amber-800",
  invalid: "border-red-200 bg-red-50 text-red-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};
const REASON: Record<string, string> = {
  syntax: "The address is not valid.",
  no_mail_server: "The domain has no mail server.",
  disposable: "A disposable inbox provider.",
  role: "A shared role address.",
  typo: "The domain may be misspelled.",
  dns_unavailable: "The domain could not be checked yet.",
};

export function VerifyBadge({
  status,
  reason,
  suggestion,
  flags,
  verifiedAt,
}: {
  status: string | null;
  reason: string | null;
  suggestion: string | null;
  flags: string[];
  verifiedAt: string | null;
}) {
  if (!status) return <span className="text-sm text-slate-500">Not verified yet. It is checked within a few minutes.</span>;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${TONE[status] ?? TONE.unknown}`}>{status}</span>
        {reason && <span className="text-slate-600">{REASON[reason] ?? ""}</span>}
        {flags.includes("free") && <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600">Free provider</span>}
        {flags.includes("role") && reason !== "role" && <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600">Role address</span>}
      </span>
      {suggestion && <span className="text-slate-600">Did you mean {suggestion}?</span>}
      {verifiedAt && <time dateTime={verifiedAt} className="text-xs text-slate-500">Checked {new Date(verifiedAt).toISOString().slice(0, 10)}</time>}
    </div>
  );
}
