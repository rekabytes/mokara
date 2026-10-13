"use client";

import { useCallback, useEffect, useMemo } from "react";
import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useResetAtom } from "jotai/utils";
import { api, type NotificationInfo } from "./api";
import { onSse } from "./sse";
import { notificationSchema } from "./api-validation";
import {
  notificationErrorAtom,
  notificationListAtom,
  notificationOpenAtom,
  notificationReadAtom,
  notificationReceivedAtom,
  notificationUnreadAtom,
} from "./notification-state";
import { useAsyncError } from "@/hooks/useAsyncError";

let booted = false;
let activeRead: AbortController | null = null;
let pendingEvents = new Map<string, NotificationInfo>();

export function openNotificationCenter() {
  getDefaultStore().set(notificationOpenAtom, true);
}

export function useNotifications() {
  const list = useAtomValue(notificationListAtom);
  const unread = useAtomValue(notificationUnreadAtom);
  const [open, setOpen] = useAtom(notificationOpenAtom);
  const error = useAtomValue(notificationErrorAtom);
  const setError = useSetAtom(notificationErrorAtom);
  const clearError = useResetAtom(notificationErrorAtom);
  const { run } = useAsyncError();

  const load = useCallback(async () => {
    activeRead?.abort();
    const controller = new AbortController();
    activeRead = controller;
    const events = new Map<string, NotificationInfo>();
    pendingEvents = events;
    clearError();
    const res = await run(() => api.listNotifications(controller.signal), {
      fallback: "Couldn't load notifications.",
      onError: setError,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    activeRead = null;
    if (!res) return;
    const store = getDefaultStore();
    store.set(notificationListAtom, res.notifications);
    store.set(notificationUnreadAtom, res.unread_count);
    // Replay events received during the snapshot read. The domain action
    // compares prior read state, so echoes already in the response are inert.
    for (const item of events.values()) store.set(notificationReceivedAtom, item);
  }, [run, clearError, setError]);

  const markAllRead = useCallback(async () => {
    clearError();
    activeRead?.abort();
    const res = await run(() => api.markNotificationsRead(null), {
      fallback: "Couldn't mark notifications as read.",
      onError: setError,
    });
    if (!res) return;
    // Reconcile the server's complete unread count, including rows outside
    // this page and notifications delivered while the mutation was in flight.
    await load();
  }, [run, clearError, setError, load]);

  const markRead = useCallback(
    async (id: string) => {
      clearError();
      activeRead?.abort();
      const res = await run(() => api.markNotificationsRead([id]), {
        fallback: "Couldn't mark the notification as read.",
        onError: setError,
      });
      if (!res) return false;
      getDefaultStore().set(notificationReadAtom, id);
      return true;
    },
    [run, clearError, setError]
  );

  // App-scoped external SSE subscription: the shared source survives route
  // changes and sign-out reloads the document. No effect drives UI animation.
  useEffect(() => {
    if (booted) return;
    booted = true;
    void load();
    onSse("notification", (data) => {
      const parsed = notificationSchema.safeParse(data);
      if (!parsed.success) return;
      if (activeRead && !activeRead.signal.aborted) pendingEvents.set(parsed.data.id, parsed.data);
      getDefaultStore().set(notificationReceivedAtom, parsed.data);
    });
    onSse("sse:reopened", () => {
      void load();
    });
  }, [load]);

  return useMemo(
    () => ({ list, unread, open, setOpen, error, clearError, load, markAllRead, markRead }),
    [list, unread, open, setOpen, error, clearError, load, markAllRead, markRead]
  );
}
