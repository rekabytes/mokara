"use client";

import { useCallback, useEffect, useState } from "react";
import { atom, useAtom } from "jotai";
import { api, type Kpi, type KpiProgress, type Project } from "./api";
import { normalizeError, type NormalizedError } from "./errors";

// PRD-06 §8: the project/KPI lists are shared cache, so they live in a Jotai
// atom keyed by container id — switching back to a container is instant, and
// the task chips, the container page and any future picker read the same
// source. Callers pass the container they actually show (the tasks page uses
// the switcher selection; /teams/[id] uses its route param). The fetch runs
// when that id changes (server sync — the kind of effect the standard
// allows), never as a state-mirroring chain.

type Meta = { projects: Project[]; kpis: Kpi[]; progress: KpiProgress[] };

const metaCacheAtom = atom<Record<string, Meta>>({});
const EMPTY: Meta = { projects: [], kpis: [], progress: [] };

export function useContainerMeta(containerId: string | null) {
  const [cache, setCache] = useAtom(metaCacheAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NormalizedError | null>(null);

  const fetchMeta = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        // all=1: the cache carries archived projects too — consumers filter
        // (pickers/rows hide them; the container page can list + unarchive).
        const [p, k, pr] = await Promise.all([
          api.listProjects(id, true),
          api.listKpis(id),
          api.getKpiProgress(id),
        ]);
        setCache((prev) => ({
          ...prev,
          [id]: { projects: p.projects, kpis: k.kpis, progress: pr.kpis },
        }));
        setError(null);
      } catch (e) {
        setError(normalizeError(e, "Failed to load projects & KPIs"));
      } finally {
        setLoading(false);
      }
    },
    [setCache]
  );

  useEffect(() => {
    if (!containerId) return;
    void fetchMeta(containerId);
  }, [containerId, fetchMeta]);

  const meta = (containerId && cache[containerId]) || EMPTY;
  return {
    projects: meta.projects,
    kpis: meta.kpis,
    progress: meta.progress,
    loading,
    error,
    refresh: useCallback(
      () => (containerId ? fetchMeta(containerId) : Promise.resolve()),
      [containerId, fetchMeta]
    ),
  };
}
