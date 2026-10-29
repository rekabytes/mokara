import { atom } from "jotai";
import {
  atomWithRefresh,
  atomWithStorage,
  createJSONStorage,
  loadable,
  unstable_withStorageValidator as withStorageValidator,
} from "jotai/utils";
import { api } from "@/lib/api";
import { isDismissedReleases } from "@/lib/changelog";

export const releaseResourceAtom = atomWithRefresh(() =>
  typeof window === "undefined" ? Promise.resolve(null) : api.changelog()
);
export const releaseViewAtom = loadable(releaseResourceAtom);
export const releaseOpenAtom = atom(false);
const storage = withStorageValidator(isDismissedReleases)(
  createJSONStorage<unknown>(() => ({
    // An unavailable display preference falls back to an unread notice. Storage
    // writes still reject through useAsyncError, and atomWithStorage owns hydration.
    getItem: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  }))
);
export const dismissedReleaseAtom = atomWithStorage<Record<string, string>>(
  "mokara:release-notices",
  {},
  storage
);
