import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="flex max-w-lg flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-slate-600">That item does not exist in this workspace, or it was deleted.</p>
      <Link href="/app" className="text-sm text-sky-700">
        Back to the workspace home
      </Link>
    </div>
  );
}
