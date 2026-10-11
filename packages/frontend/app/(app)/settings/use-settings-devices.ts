"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SessionInfo } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { signOutServer } from "@/lib/session";

type Actions = Pick<ReturnType<typeof useAsyncError>, "run" | "clearError">;

export function useSettingsDevices({ run, clearError }: Actions) {
  // --- devices: live session registry ---
  const { error: devicesError, clearError: clearDevicesError, run: runDevices } = useAsyncError();
  const devicesRead = useRef<AbortController | null>(null);
  const [devices, setDevices] = useState<SessionInfo[] | null>(null);

  const loadDevices = useCallback(async () => {
    devicesRead.current?.abort();
    const controller = new AbortController();
    devicesRead.current = controller;
    clearDevicesError();
    const data = await runDevices(() => api.listSessions(controller.signal), {
      fallback: "Couldn't load your devices.",
      signal: controller.signal,
    });
    if (data === null) return;
    setDevices(data.sessions);
  }, [runDevices, clearDevicesError]);

  // Initial device load — the documented allowed effect: a one-time read of
  // something outside React (the session registry over the API), re-run only
  // when the stable loadDevices identity changes.
  useEffect(() => {
    void loadDevices();
    return () => devicesRead.current?.abort();
  }, [loadDevices]);

  const devicesPending = useRef(false);
  const [devicesBusy, setDevicesBusy] = useState(false);

  const onRevokeDevice = async (id: string) => {
    if (devicesPending.current) return;
    devicesPending.current = true;
    setDevicesBusy(true);
    devicesRead.current?.abort();
    clearError();
    try {
      const row = devices?.find((d) => d.id === id);
      const ok = await run(() => api.revokeSession(id), {
        fallback: "Couldn't sign out that device. Try again.",
      });
      if (ok === null) return;
      if (row?.current) {
        // Revoking yourself is a sign-out: clear the now-dead cookie and exit
        // hard to the front door — no client transition to race (2026-09-04).
        // This session is already revoked; leaving is safe even if the cookie
        // cleanup request fails. The server will reject the revoked token.
        await run(signOutServer);
        window.location.assign("/");
        return;
      }
      await loadDevices();
    } finally {
      devicesPending.current = false;
      setDevicesBusy(false);
    }
  };

  const onRevokeAll = async () => {
    if (devicesPending.current) return;
    devicesPending.current = true;
    setDevicesBusy(true);
    devicesRead.current?.abort();
    clearError();
    try {
      const ok = await run(() => api.revokeAllSessions(), {
        fallback: "Couldn't sign out your sessions. Try again.",
      });
      if (ok === null) return;
      // The endpoint already cleared the cookie — just leave, hard.
      window.location.assign("/");
    } finally {
      devicesPending.current = false;
      setDevicesBusy(false);
    }
  };

  return { devices, devicesError, devicesBusy, loadDevices, onRevokeDevice, onRevokeAll };
}
