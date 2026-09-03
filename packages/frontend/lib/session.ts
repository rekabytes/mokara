"use client";

import { useCallback, useEffect } from "react";
import { atom, getDefaultStore, useAtom } from "jotai";
import { api, type User } from "./api";

// PRD-06 §8: session is shared global state, so it lives in a module-level
// Jotai atom — ONE value for every page. The /me probe runs once per app
// lifetime (module `booted` guard) instead of every page mount re-fetching,
// and login/signup set the user directly via setSessionUser() so no page has
// to re-probe to notice an auth change.
//
// Default store everywhere: this app renders no <Provider>, so
// getDefaultStore() below and useAtom() read/write the same state.

type SessionState =
  { status: "loading" } | { status: "anonymous" } | { status: "authed"; user: User };

const sessionAtom = atom<SessionState>({ status: "loading" });
let booted = false;

function store() {
  return getDefaultStore();
}

/** Call after a successful login/signup — no /me round-trip needed. */
export function setSessionUser(user: User) {
  booted = true;
  store().set(sessionAtom, { status: "authed", user });
}

function markAnonymous() {
  store().set(sessionAtom, { status: "anonymous" });
}

export function useSession(): SessionState & {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
} {
  const [state] = useAtom(sessionAtom);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.me();
      setSessionUser(user);
    } catch {
      // The session probe never shows an error: 401, an expired cookie and an
      // unreachable API all read as "not signed in", and the route guards
      // decide what to render. lib/api.ts already logged the failed call, so
      // the reason is still in the terminal.
      markAnonymous();
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the cookie is cleared client-side anyway */
    }
    markAnonymous();
  }, []);

  // Bootstrap probe — once per app lifetime, not once per page mount.
  useEffect(() => {
    if (booted) return;
    booted = true;
    void refresh();
  }, [refresh]);

  return { ...state, refresh, logout };
}
