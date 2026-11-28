"use client";
import { useEffect } from "react";

// Last-resort page for an error outside the dashboard. The message is never shown, only the digest that matches the server log.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page error", error.digest ?? "no digest");
  }, [error]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-3 p-6">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-slate-600">The page could not be loaded. Try again, and if it keeps happening tell whoever runs this instance{error.digest ? ` and quote ${error.digest}` : ""}.</p>
      <button onClick={reset} className="h-9 rounded-md bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700">
        Try again
      </button>
    </main>
  );
}
