import { atom } from "jotai";
import { atomWithReset } from "jotai/utils";
import type { NotificationInfo } from "./api-types";
import type { NormalizedError } from "./errors";

export const notificationListAtom = atom<NotificationInfo[] | null>(null);
export const notificationUnreadAtom = atom(0);
export const notificationOpenAtom = atom(false);
export const notificationErrorAtom = atomWithReset<NormalizedError | null>(null);

// Domain actions keep list/count changes together and are idempotent for
// repeated clicks and SSE echoes. The server may count items outside this page.
export const notificationReadAtom = atom(null, (get, set, id: string) => {
  const list = get(notificationListAtom);
  const row = list?.find((item) => item.id === id);
  if (!row || row.read_at) return;
  set(
    notificationListAtom,
    list?.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item)) ??
      null
  );
  set(notificationUnreadAtom, Math.max(0, get(notificationUnreadAtom) - 1));
});

export const notificationReceivedAtom = atom(null, (get, set, item: NotificationInfo) => {
  const list = get(notificationListAtom) ?? [];
  const previous = list.find((row) => row.id === item.id);
  set(
    notificationListAtom,
    previous ? list.map((row) => (row.id === item.id ? item : row)) : [item, ...list].slice(0, 50)
  );
  const delta = Number(item.read_at === null) - Number(previous?.read_at === null);
  set(notificationUnreadAtom, Math.max(0, get(notificationUnreadAtom) + delta));
});
