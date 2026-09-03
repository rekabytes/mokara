"use client";

import { useEffect, useMemo } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { api, type Kpi, type KpiProgress, type Project } from "./api";
import { normalizeError, type NormalizedError } from "./errors";

// PRD-06 §8: the project/KPI lists are shared cache, so they live in a Jotai
// atom keyed by container id — switching back to a container is instant, and
// the task chips, the container page and any future picker read the same
// source. Callers pass the container they actually show (the tasks page uses
// the switcher selection; /teams/[id] uses its route param). The fetch runs
// when that id changes (server sync — the kind of effect the standard
// allows), never as a state-mirroring chain.
//
// Loading + error live in the store too, not in useState. Two pages mount this
// hook for the same container; per-hook status meant each one kept its own
// `loading` flag and the last writer won the error slot. One record keyed by
// container id is the same fact both consumers can agree on.

type Meta = { projects: Project[]; kpis: Kpi[]; progress: KpiProgress[] };
type MetaStatus = { loading: boolean; error: NormalizedError | null };

const metaCacheAtom = atom<Record<string, Meta>>({});
const metaStatusAtom = atom<Record<string, MetaStatus>>({});

const EMPTY: Meta = { projects: [], kpis: [], progress: [] };
const IDLE: MetaStatus = { loading: false, error: null };

function writeStatus(id: string, status: MetaStatus) {
  const store = getDefaultStore();
  store.set(metaStatusAtom, { ...store.get(metaStatusAtom), [id]: status });
}

/**
 * Fetch one container's projects, KPIs and KPI progress into the shared
 * cache. A plain module function rather than a hook-local callback so the
 * cache is written through one path no matter who asks — and so the store,
 * not a render, decides what's already there.
 */
async function loadMeta(id: string): Promise<void> {
  const store = getDefaultStore();
  writeStatus(id, { loading: true, error: null });
  try {
    // all=1: the cache carries archived projects too — consumers filter
    // (pickers/rows hide them; the container page can list + unarchive).
    const [p, k, pr] = await Promise.all([
      api.listProjects(id, true),
      api.listKpis(id),
      api.getKpiProgress(id),
    ]);
    store.set(metaCacheAtom, {
      ...store.get(metaCacheAtom),
      [id]: { projects: p.projects, kpis: k.kpis, progress: pr.kpis },
    });
    writeStatus(id, { loading: false, error: null });
  } catch (e) {
    writeStatus(id, { loading: false, error: normalizeError(e, "Failed to load projects & KPIs") });
  }
}

export function useContainerMeta(containerId: string | null) {
  const cache = useAtomValue(metaCacheAtom);
  const statuses = useAtomValue(metaStatusAtom);

  // Server sync for the container on screen. The cache check reads through the
  // default store instead of being an effect dependency — it asks "has anyone
  // already loaded or started loading this container", not "react when the
  // cache changes". The in-flight half matters: /tasks and /teams/[id] mount in
  // the same commit, and without it both would fire their three requests before
  // either answer arrived.
  useEffect(() => {
    if (!containerId) return;
    const store = getDefaultStore();
    if (store.get(metaCacheAtom)[containerId]) return;
    if (store.get(metaStatusAtom)[containerId]?.loading) return;
    void loadMeta(containerId);
  }, [containerId]);

  const meta = (containerId && cache[containerId]) || EMPTY;
  const status = (containerId && statuses[containerId]) || IDLE;

  // Stable-ish return: consumers spread this into useCallback deps, and a new
  // object every render would re-create their loaders.
  return useMemo(
    () => ({
      projects: meta.projects,
      kpis: meta.kpis,
      progress: meta.progress,
      loading: status.loading,
      error: status.error,
      refresh: (): Promise<void> => (containerId ? loadMeta(containerId) : Promise.resolve()),
    }),
    [containerId, meta, status]
  );
}
