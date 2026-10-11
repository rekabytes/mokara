"use client";

import { useEffect, useMemo } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { selectAtom, unwrap } from "jotai/utils";
import { api, type Kpi, type KpiProgress, type Project } from "./api";
import { normalizeError, type NormalizedError } from "./errors";

type Meta = { projects: Project[]; kpis: Kpi[]; progress: KpiProgress[] };
type Outcome = { error: NormalizedError | null };
const metaCacheAtom = atom<Partial<Record<string, Meta>>>({});
const metaRequestsAtom = atom<Partial<Record<string, Promise<Outcome>>>>({});
const reads = new Map<string, AbortController>();
const EMPTY: Meta = { projects: [], kpis: [], progress: [] };
const IDLE: Outcome = { error: null };

/** Shared refresh ownership: consumers of one container share one request.
 * Explicit refresh supersedes its previous read; other containers are isolated.
 * Cached rows remain usable while refreshing and after a failed refresh. */
export async function refreshContainerMeta(id: string): Promise<void> {
  const store = getDefaultStore();
  reads.get(id)?.abort();
  const controller = new AbortController();
  reads.set(id, controller);
  const request = Promise.all([
    api.listProjects(id, true, controller.signal),
    api.listKpis(id, controller.signal),
    api.getKpiProgress(id, controller.signal),
  ]).then(
    ([p, k, pr]): Outcome => {
      if (!controller.signal.aborted) {
        store.set(metaCacheAtom, {
          ...store.get(metaCacheAtom),
          [id]: { projects: p.projects, kpis: k.kpis, progress: pr.kpis },
        });
      }
      return IDLE;
    },
    (error: unknown): Outcome => ({
      error: controller.signal.aborted
        ? null
        : normalizeError(error, "Failed to load projects & KPIs"),
    })
  );
  store.set(metaRequestsAtom, { ...store.get(metaRequestsAtom), [id]: request });
  await request;
  if (reads.get(id) === controller) reads.delete(id);
}

/** Per-container subscription and Jotai's official non-Suspense async adapter.
 * The promise resolves to a normalized outcome, so failures stay in the shared
 * error contract rather than escaping through a render boundary. */
export function containerMetaViewAtom(id: string | null) {
  const cache = selectAtom(metaCacheAtom, (entries) => (id && entries[id]) || EMPTY);
  const request = selectAtom(metaRequestsAtom, (entries) => (id && entries[id]) || IDLE);
  const outcome = unwrap(request);
  return atom((get) => {
    const meta = get(cache);
    const result = get(outcome);
    return { ...meta, loading: result === undefined, error: result?.error ?? null };
  });
}

export function useContainerMeta(containerId: string | null) {
  const view = useMemo(() => containerMetaViewAtom(containerId), [containerId]);
  const state = useAtomValue(view);

  // External server metadata is shared across pages, so the request outlives
  // individual consumers. Bootstrap once per container; refresh is an explicit
  // action. Only a newer read of the same container cancels the shared request.
  useEffect(() => {
    if (!containerId || getDefaultStore().get(metaRequestsAtom)[containerId]) return;
    void refreshContainerMeta(containerId);
  }, [containerId]);

  return useMemo(
    () => ({
      ...state,
      refresh: (): Promise<void> =>
        containerId ? refreshContainerMeta(containerId) : Promise.resolve(),
    }),
    [containerId, state]
  );
}
