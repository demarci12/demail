"use client";
import Link from "next/link";
import { useEffect } from "react";

// Keeps the navigation visible when one dashboard page fails to load.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("dashboard page error", error.digest ?? "no digest");
  }, [error]);
  return (
    <div className="flex max-w-lg flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">This page could not be loaded</h1>
      <p className="text-sm text-slate-600">
        Your data is safe. Try again. If it keeps failing, check{" "}
        <Link href="/app/settings/health" className="text-sky-700">
          Setup health
        </Link>{" "}
        {error.digest ? `and quote ${error.digest} to whoever runs this instance.` : "or ask whoever runs this instance."}
      </p>
      <button onClick={reset} className="h-9 rounded-md bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700">
        Try again
      </button>
    </div>
  );
}
