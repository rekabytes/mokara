"use client";

import { useCallback, useEffect, useMemo } from "react";
import { atom, getDefaultStore, useAtom } from "jotai";
import { api, type SessionUser, type TourState } from "./api";

// PRD-06 §8: session is shared global state, so it lives in a module-level
// Jotai atom — ONE value for every page. The /me probe runs once per app
// lifetime (module `booted` guard) instead of every page mount re-fetching,
// and login/signup set the user directly via setSessionUser() so no page has
// to re-probe to notice an auth change.
//
// Default store everywhere: this app renders no <Provider>, so
// getDefaultStore() below and useAtom() read/write the same state.

type SessionState =
  { status: "loading" } | { status: "anonymous" } | { status: "authed"; user: SessionUser };

const sessionAtom = atom<SessionState>({ status: "loading" });
let booted = false;

function store() {
  return getDefaultStore();
}

/** Call after a successful login/signup — no /me round-trip needed. */
export function setSessionUser(user: SessionUser) {
  booted = true;
  store().set(sessionAtom, { status: "authed", user });
}

/** PRD-13: fold the tour dismissal into the session user after the PATCH, so
 * the overlay cannot re-open in this tab — the /me probe already ran and
 * deliberately never runs again. Only `tour_state` is touched: the resolved
 * timestamp is the server's, nothing client-side reads it, and inventing one
 * here would be a small lie. The server stays the truth for the next load. */
export function setSessionTourState(state: TourState): void {
  const current = store().get(sessionAtom);
  if (current.status !== "authed") return;
  store().set(sessionAtom, {
    status: "authed",
    user: { ...current.user, tour_state: state },
  });
}

function markAnonymous() {
  store().set(sessionAtom, { status: "anonymous" });
}

/** Server-side sign-out only — no shared state change. Deliberate sign-outs
 * hard-navigate to `/` right after (PRD-08), so the document reload resets the
 * atom anyway; flipping it here would only race AppShell's expiry redirect
 * ("Rendered more hooks than during the previous render" — two navigators in
 * one transition, learned 2026-09-04). */
export async function signOutServer(): Promise<void> {
  try {
    await api.logout();
  } catch {
    /* the endpoint clears the cookie; nothing to recover */
  }
}

export function useSession(): SessionState & {
  refresh: () => Promise<void>;
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

  // Bootstrap probe — once per app lifetime, not once per page mount. This is
  // the canonical allowed effect: a one-time read of something outside React
  // (the session cookie), guarded by a module flag so it never re-runs.
  useEffect(() => {
    if (booted) return;
    booted = true;
    void refresh();
  }, [refresh]);

  // Memoised so `session` is safe to put in a consumer's dependency array —
  // spreading `...state` into a fresh object every render made every mount of
  // a hook consumer re-run anything that (correctly) depended on it.
  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
}
