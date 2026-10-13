"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Analytics, type KpiProgress, type Progress } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { WINDOW_DAYS } from "./analytics-model";

// Independent request state keeps each card retryable without reloading peers.
export function useAnalyticsData(teamId: string | null) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const { error, setError, run } = useAsyncError();
  const { error: progressError, setError: setProgressError, run: runProgress } = useAsyncError();
  const { error: kpiError, setError: setKpiError, run: runKpiProgress } = useAsyncError();
  const [kpiProgress, setKpiProgress] = useState<KpiProgress[] | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressLoading, setProgressLoading] = useState(true);
  const reads = useRef<{
    analytics?: AbortController;
    progress?: AbortController;
    kpis?: AbortController;
  }>({});
  const load = useCallback(async () => {
    reads.current.analytics?.abort();
    const controller = new AbortController();
    reads.current.analytics = controller;
    if (!teamId) return;
    setLoading(true);
    setError(null);
    const a = await run(() => api.getAnalytics(teamId, WINDOW_DAYS, controller.signal), {
      fallback: "Couldn't load analytics",
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    setLoading(false);
    if (a) setData(a);
  }, [teamId, run, setError]);

  const loadProgress = useCallback(async () => {
    reads.current.progress?.abort();
    const controller = new AbortController();
    reads.current.progress = controller;
    if (!teamId) return;
    setProgressLoading(true);
    setProgressError(null);
    const p = await runProgress(() => api.getProgress(teamId, controller.signal), {
      fallback: "Couldn't load progress",
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    setProgressLoading(false);
    if (p) setProgress(p);
  }, [teamId, runProgress, setProgressError]);

  const loadKpiProgress = useCallback(async () => {
    reads.current.kpis?.abort();
    const controller = new AbortController();
    reads.current.kpis = controller;
    if (!teamId) return;
    setKpiLoading(true);
    setKpiError(null);
    const res = await runKpiProgress(() => api.getKpiProgress(teamId, controller.signal), {
      fallback: "Couldn't load KPI progress",
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    setKpiLoading(false);
    if (res) setKpiProgress(res.kpis);
  }, [teamId, runKpiProgress, setKpiError]);

  // One effect for the three reads this page makes. Each loader is still
  // separate because every card has its own Retry button, but the trigger is
  // now a single server-sync — three near-identical `useEffect(() => x(), [x])`
  // chains was three chances to get a dependency wrong.
  //
  // The `!teamId` branch is the bug this consolidates: the loaders returned
  // early there without ever clearing their own `loading` flag, which is
  // initialised to true — so an account with no containers sat on "Loading…"
  // on all three cards, forever.
  const loadAll = useCallback(() => {
    if (!teamId) {
      setLoading(false);
      setProgressLoading(false);
      setKpiLoading(false);
      return;
    }
    return Promise.all([load(), loadProgress(), loadKpiProgress()]);
  }, [teamId, load, loadProgress, loadKpiProgress]);

  useEffect(() => {
    setData(null);
    setProgress(null);
    setKpiProgress(null);
    void loadAll();
    const activeReads = reads.current;
    return () => {
      activeReads.analytics?.abort();
      activeReads.progress?.abort();
      activeReads.kpis?.abort();
    };
  }, [loadAll]);

  return {
    data,
    loading,
    error,
    load,
    progress,
    progressLoading,
    progressError,
    loadProgress,
    kpiProgress,
    kpiLoading,
    kpiError,
    loadKpiProgress,
  };
}
