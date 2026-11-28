import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-3 p-6">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-slate-600">That address does not exist, or you do not have access to it.</p>
      <Link href="/app" className="text-sm text-sky-700">
        Go to your workspace
      </Link>
    </main>
  );
}
