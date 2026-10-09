"use client";

import { FatalError } from "@/components/FatalError";

/** Catches unhandled render and lifecycle failures below the root layout. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <FatalError error={error} reset={reset} />;
}
