"use client";

import { useCallback, useEffect, useMemo } from "react";
import { atom, getDefaultStore, useAtom, useAtomValue } from "jotai";
import { api, type Team, type TeamWithRole } from "./api";
import { normalizeError, type NormalizedError } from "./errors";

// PRD-06 §8: the container list + which container is selected are shared
// global state → Jotai atoms, not per-page useState. One bootstrap load per
// app lifetime (module `booted` guard); pages read `useContainers()`.
// Default store everywhere (no <Provider> in this app).

export const containersAtom = atom<TeamWithRole[]>([]);
export const containersErrorAtom = atom<NormalizedError | null>(null);
export const selectedContainerIdAtom = atom<string | null>(null);

// Derived: explicit pick wins, else the newest container (list is ordered
// newest-first by the API). No effect mirrors this — it's computed on read.
// The "no pick" case almost never survives a bootstrap any more: load()
// restores the server-side last selection into the atom before anything
// reads this.
export const selectedContainerAtom = atom<TeamWithRole | null>((get) => {
  const list = get(containersAtom);
  const id = get(selectedContainerIdAtom);
  return list.find((t) => t.id === id) ?? list[0] ?? null;
});

let booted = false;

export function useContainers() {
  const [containers, setContainers] = useAtom(containersAtom);
  const [error, setError] = useAtom(containersErrorAtom);
  const [selectedId, setSelectedId] = useAtom(selectedContainerIdAtom);
  const selected = useAtomValue(selectedContainerAtom);

  // Owner (2026-09-06): every explicit pick is stored server-side
  // (users.last_container_id) so a refresh — or a new tab, or another device
  // — restores "where you work" instead of falling back to the newest
  // workspace. Server state, not device storage: the cookie policy's "no
  // localStorage" promise stays literally true. Fire-and-forget — a failed
  // write only costs the next refresh its memory, never the current view.
  const selectContainer = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) void api.setLastContainer(id).catch(() => undefined);
    },
    [setSelectedId]
  );

  const load = useCallback(async () => {
    try {
      const { teams, last_container_id } = await api.listTeams();
      // Legacy fallback: accounts predating server-side signup workspaces.
      if (teams.length === 0) {
        const created = await api.createTeam({ name: "Personal", kind: "workspace" });
        teams.push({ ...created.team, role: "owner" });
      }
      setContainers(teams);
      setError(null);
      // Restore the pick BEFORE anything reads the derived fallback, and only
      // when this session has no explicit choice yet. Written through the
      // default store (same idiom as lib/notifications.ts) so it neither
      // re-renders this hook's consumers twice nor echoes a PUT back for a
      // selection the server already knows.
      if (
        last_container_id &&
        teams.some((t) => t.id === last_container_id) &&
        !getDefaultStore().get(selectedContainerIdAtom)
      ) {
        getDefaultStore().set(selectedContainerIdAtom, last_container_id);
      }
    } catch (e) {
      setError(normalizeError(e, "Failed to load your workspaces"));
    }
  }, [setContainers, setError]);

  /** Create a container (switcher modal / teams-new page), then select it. */
  const create = useCallback(
    async (name: string, kind: "workspace" | "team"): Promise<Team | null> => {
      try {
        const { team } = await api.createTeam({ name, kind });
        setContainers((prev) => [{ ...team, role: "owner" }, ...prev]);
        selectContainer(team.id);
        setError(null);
        return team;
      } catch (e) {
        setError(normalizeError(e, "Failed to create the container"));
        return null;
      }
    },
    [setContainers, selectContainer, setError]
  );

  // Bootstrap probe — same one-time-outside-React read as lib/session.ts.
  useEffect(() => {
    if (booted) return;
    booted = true;
    void load();
  }, [load]);

  // Memoised for the same reason as useSession(): consumers legitimately list
  // this object (or `load`) in a useCallback dep array, and a fresh identity
  // every render turns that into a refetch loop. `setSelectedId` keeps its
  // name at the call sites — it is now the persisting wrapper.
  return useMemo(
    () => ({
      containers,
      selected,
      selectedId,
      setSelectedId: selectContainer,
      error,
      load,
      create,
    }),
    [containers, selected, selectedId, selectContainer, error, load, create]
  );
}
