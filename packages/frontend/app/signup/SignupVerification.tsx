"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";

import { loadTurnstile, type Turnstile } from "@/lib/turnstile";

export type SignupVerificationState = { ready: boolean; token?: string };

export function SignupVerification({
  onChange,
}: {
  onChange: (state: SignupVerificationState) => void;
}) {
  const { error, run, clearError } = useAsyncError();
  // Provider callbacks outlive individual renders. Read the latest consumer
  // without destroying a valid widget whenever a parent callback changes.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const notify = useCallback((state: SignupVerificationState) => onChangeRef.current(state), []);
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "disabled" | "active" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  // Sync the provider's external script/widget lifecycle and public runtime
  // configuration with this mounted form. Never keep a consumed/expired token.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let widget: string | undefined;
    let provider: Turnstile | undefined;
    notify({ ready: false });
    clearError();
    async function setup() {
      const result = await run(
        async () => {
          const config = await api.signupProtection(controller.signal);
          if (!active) return;
          if (!config.required) {
            setStatus("disabled");
            notify({ ready: true });
            return;
          }
          if (!config.site_key) throw new Error("Missing verification configuration");
          provider = await loadTurnstile();
          if (!active || !container.current) return;
          setStatus("active");
          widget = provider.render(container.current, {
            sitekey: config.site_key,
            action: "signup",
            size: "flexible",
            theme: "light",
            callback: (token) => {
              if (active) {
                setStatus("active");
                notify({ ready: true, token });
              }
            },
            "expired-callback": () => {
              if (active) {
                notify({ ready: false });
                setStatus("error");
              }
            },
            "error-callback": () => {
              if (active) {
                notify({ ready: false });
                setStatus("error");
              }
            },
          });
          return true;
        },
        { signal: controller.signal, fallback: "Verification couldn't load. Please try again." }
      );
      if (active && result === null) {
        setStatus("error");
        notify({ ready: false });
      }
    }
    void setup();
    return () => {
      active = false;
      controller.abort();
      if (widget !== undefined) provider?.remove(widget);
    };
  }, [attempt, notify, run, clearError]);

  if (status === "disabled") return null;
  return (
    <div className="min-w-0" aria-label="Registration verification">
      <div ref={container} className="min-w-0" />
      {status === "loading" && (
        <p role="status" className="m-0 text-[0.78rem] text-[var(--color-ink-muted)]">
          Loading verification…
        </p>
      )}
      {status === "error" && (
        <>
          <ErrorBanner
            message={error?.message ?? "Verification expired or couldn't load. Please try again."}
          />
          <button
            type="button"
            className="btn-base btn-ghost btn-small mt-2"
            onClick={() => {
              notify({ ready: false });
              clearError();
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          >
            Retry verification
          </button>
        </>
      )}
    </div>
  );
}
