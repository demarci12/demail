import type { ReactNode } from "react";
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>{children}</div>;
}
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  const cls = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-sky-200 bg-sky-50 text-sky-800";
  return <p className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</p>;
}
// An empty list: what it holds, why nothing is there and the one next step.
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 p-5 text-sm">
      <p className="font-medium text-slate-800">{title}</p>
      {children && <p className="max-w-prose text-slate-600">{children}</p>}
      {action}
    </div>
  );
}
