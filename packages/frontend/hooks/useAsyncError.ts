"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeError, type NormalizedError } from "@/lib/errors";

// Global error handling for anything that talks to the API. One hook, used by
// every page, so a failure is mapped, logged and routed in exactly one place:
//
//   const { error, run } = useAsyncError();
//   const teams = await run(() => api.listTeams(), { fallback: "Failed to load teams" });
//   if (!teams) return;                      // handled: state set / redirect fired
//
// What it does on a throw:
//   1. normalizes whatever was thrown into a NormalizedError (lib/errors.ts)
//   2. `action: "redirect"` (session gone) → clears the error and replaces to
//      /login, so no page has to hand-write the old 401 check again
//   3. otherwise stores it in `error` for the caller to render
//   4. returns null instead of throwing, so callers keep linear control flow
//
// The API call itself is already logged by lib/api.ts; this stays quiet so a
// failure isn't printed twice.

export type RunOptions = {
  /** Copy used only when the error code is genuinely unmapped. */
  fallback?: string;
  /** Side effects that must run on any failure (optimistic-UI rollback etc). */
  onError?: (err: NormalizedError) => void;
};

export function useAsyncError() {
  const router = useRouter();
  const [error, setError] = useState<NormalizedError | null>(null);

  // `run` must keep a stable identity: pages put it in useCallback deps, and a
  // new function every render would re-create their loaders and refetch in a
  // loop. The router lives in a ref so the callback needs no dependency.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  const clearError = useCallback(() => setError(null), []);

  const run = useCallback(
    async <T>(fn: () => Promise<T>, opts: RunOptions = {}): Promise<T | null> => {
      try {
        return await fn();
      } catch (e) {
        const err = normalizeError(e, opts.fallback);
        opts.onError?.(err);
        if (err.action === "redirect") {
          setError(null);
          routerRef.current.replace("/login");
        } else {
          setError(err);
        }
        return null;
      }
    },
    []
  );

  return { error, setError, clearError, run };
}
