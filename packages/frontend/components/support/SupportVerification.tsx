"use client";
import { useEffect, useRef } from "react";
import { loadTurnstile, type Turnstile } from "@/lib/turnstile";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
export function SupportVerification({
  siteKey,
  onToken,
}: {
  siteKey: string | null;
  onToken: (token: string | undefined) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    callback = useRef(onToken);
  callback.current = onToken;
  const { run, error } = useAsyncError();
  // Turnstile owns an external DOM widget; synchronize its lifetime and remove
  // it on unmount. Provider callbacks invalidate expired or consumed tokens.
  useEffect(() => {
    let active = true,
      provider: Turnstile | undefined,
      widget: string | undefined;
    if (siteKey)
      void run(async () => {
        provider = await loadTurnstile();
        if (!active || !container.current) return;
        widget = provider.render(container.current, {
          sitekey: siteKey,
          action: "support",
          size: "flexible",
          theme: "light",
          callback: (token) => {
            if (active) callback.current(token);
          },
          "expired-callback": () => {
            if (active) callback.current(undefined);
          },
          "error-callback": () => {
            if (active) callback.current(undefined);
          },
        });
        return true;
      });
    return () => {
      active = false;
      if (widget !== undefined) provider?.remove(widget);
    };
  }, [siteKey, run]);
  return (
    <>
      <div ref={container} />
      {error && <ErrorBanner message={error.message} />}
    </>
  );
}
