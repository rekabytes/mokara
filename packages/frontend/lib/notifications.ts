"use client";

import { useCallback, useEffect } from "react";
import { atom, getDefaultStore, useAtom, useAtomValue } from "jotai";
import { api, type NotificationInfo } from "./api";

// PRD-05: shared notification state, same pattern as lib/session.ts — module
// atoms on the default store, one REST backfill + one SSE connection per app
// lifetime (the `booted` guard). The bell badge and the drawer both read the
// same atoms; SSE keeps them live without polling.

const listAtom = atom<NotificationInfo[] | null>(null);
const unreadAtom = atom(0);
const panelOpenAtom = atom(false);

let booted = false;

function store() {
  return getDefaultStore();
}

/** Opens the drawer from anywhere (the bell uses this — no hook needed). */
export function openNotificationCenter() {
  store().set(panelOpenAtom, true);
}

export function useNotifications() {
  const [list] = useAtom(listAtom);
  const unread = useAtomValue(unreadAtom);
  const [open, setOpen] = useAtom(panelOpenAtom);

  const load = useCallback(async () => {
    const res = await api.listNotifications().catch(() => null);
    if (!res) return;
    store().set(listAtom, res.notifications);
    store().set(unreadAtom, res.unread_count);
  }, []);

  const markAllRead = useCallback(async () => {
    const res = await api.markNotificationsRead(null).catch(() => null);
    if (!res) return;
    store().set(unreadAtom, 0);
    store().set(
      listAtom,
      (prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null
    );
  }, []);

  const markRead = useCallback(async (id: string) => {
    await api.markNotificationsRead([id]).catch(() => null);
    store().set(unreadAtom, (u) => Math.max(0, u - 1));
    store().set(
      listAtom,
      (prev) =>
        prev?.map((n) =>
          n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n
        ) ?? null
    );
  }, []);

  // One-time REST backfill + SSE subscription. EventSource reconnects on its
  // own; the `booted` guard keeps a single connection across page navigations
  // (the document reload of a sign-out resets everything, per PRD-08).
  useEffect(() => {
    if (booted) return;
    booted = true;
    void load();
    const es = new EventSource("/api/events");
    es.addEventListener("notification", (e) => {
      // The SSE frame's data is the generic wire envelope { event, data }
      // (lib/events.ts) — the notification itself lives in .data.
      const envelope = JSON.parse((e as MessageEvent).data) as {
        event: string;
        data: NotificationInfo;
      };
      const n = envelope.data;
      if (!n?.id) return;
      store().set(listAtom, (prev) => {
        // An existing id means this is an UPDATE (e.g. an invitation gained
        // its `responded` state) — replace in place, don't duplicate.
        const idx = prev?.findIndex((p) => p.id === n.id) ?? -1;
        if (prev && idx >= 0) {
          const next = [...prev];
          next[idx] = n;
          return next;
        }
        return [n, ...(prev ?? [])].slice(0, 50);
      });
      if (!n.read_at) store().set(unreadAtom, (u) => u + 1);
    });
  }, [load]);

  return { list, unread, open, setOpen, load, markAllRead, markRead };
}
