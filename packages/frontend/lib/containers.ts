"use client";

import { useCallback, useEffect, useMemo } from "react";
import { atom, useAtom, useAtomValue } from "jotai";
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

  const load = useCallback(async () => {
    try {
      const { teams } = await api.listTeams();
      // Legacy fallback: accounts predating server-side signup workspaces.
      if (teams.length === 0) {
        const created = await api.createTeam({ name: "Personal", kind: "workspace" });
        teams.push({ ...created.team, role: "owner" });
      }
      setContainers(teams);
      setError(null);
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
        setSelectedId(team.id);
        setError(null);
        return team;
      } catch (e) {
        setError(normalizeError(e, "Failed to create the container"));
        return null;
      }
    },
    [setContainers, setSelectedId, setError]
  );

  // Bootstrap probe — same one-time-outside-React read as lib/session.ts.
  useEffect(() => {
    if (booted) return;
    booted = true;
    void load();
  }, [load]);

  // Memoised for the same reason as useSession(): consumers legitimately list
  // this object (or `load`) in a useCallback dep array, and a fresh identity
  // every render turns that into a refetch loop.
  return useMemo(
    () => ({ containers, selected, selectedId, setSelectedId, error, load, create }),
    [containers, selected, selectedId, setSelectedId, error, load, create]
  );
}
