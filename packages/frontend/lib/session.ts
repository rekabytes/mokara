"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type User, isApiError } from "./api";

type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authed"; user: User };

export function useSession(): SessionState & {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
} {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.me();
      setState({ status: "authed", user });
    } catch (e: unknown) {
      if (isApiError(e) && e.status === 401) {
        setState({ status: "anonymous" });
      } else {
        setState({ status: "anonymous" });
      }
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* swallow */
    }
    setState({ status: "anonymous" });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh, logout };
}