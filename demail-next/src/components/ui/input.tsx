import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
const base = "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} ${className}`} {...props} />;
}
export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${base} ${className}`} {...props} />;
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
