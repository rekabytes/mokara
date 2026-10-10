"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Shared last-resort UI for Next.js render error boundaries. */
export function FatalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // API failures are logged by lib/api.ts. This channel is specifically for
    // render/lifecycle failures that never pass through the API normalizer.
    console.error("[ui] unhandled render error", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <section className="card w-full max-w-[460px] p-7 text-center" role="alert">
        <p className="mb-2 mt-0 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[var(--color-danger)]">
          Something went wrong
        </p>
        <h1 className="m-0 text-[1.6rem] font-extrabold tracking-[-0.03em]">
          This page couldn&apos;t be displayed
        </h1>
        <p className="mb-6 mt-2 text-[0.9rem] leading-6 text-[var(--color-ink-muted)]">
          Try loading it again. If the problem continues, return home and start over.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-base btn-primary" onClick={reset}>
            Try again
          </button>
          <Link className="btn-base btn-ghost" href="/">
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
