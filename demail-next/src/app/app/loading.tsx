export default function Loading() {
  return (
    <div className="flex max-w-3xl flex-col gap-3" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
      <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
    </div>
  );
}
