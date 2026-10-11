"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";

type Turnstile = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: "flexible";
      theme: "light";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    }
  ) => string;
  remove: (widget: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptPromise: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    const timer = window.setTimeout(fail, 15_000);
    function fail() {
      window.clearTimeout(timer);
      script.remove();
      scriptPromise = null;
      reject(new Error("Verification could not load"));
    }
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return scriptPromise;
}

export type SignupVerificationState = { ready: boolean; token?: string };

export function SignupVerification({
  onChange,
}: {
  onChange: (state: SignupVerificationState) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "disabled" | "active" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  // Sync the provider's external script/widget lifecycle and public runtime
  // configuration with this mounted form. Never keep a consumed/expired token.
  useEffect(() => {
    let active = true;
    let widget: string | undefined;
    let provider: Turnstile | undefined;
    onChange({ ready: false });
    async function setup() {
      try {
        const config = await api.signupProtection();
        if (!active) return;
        if (!config.required) {
          setStatus("disabled");
          onChange({ ready: true });
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
              onChange({ ready: true, token });
            }
          },
          "expired-callback": () => {
            if (active) {
              onChange({ ready: false });
              setStatus("error");
            }
          },
          "error-callback": () => {
            if (active) {
              onChange({ ready: false });
              setStatus("error");
            }
          },
        });
      } catch {
        if (active) {
          setStatus("error");
          onChange({ ready: false });
        }
      }
    }
    void setup();
    return () => {
      active = false;
      if (widget !== undefined) provider?.remove(widget);
    };
  }, [attempt, onChange]);

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
          <ErrorBanner message="Verification expired or couldn't load. Please try again." />
          <button
            type="button"
            className="btn-base btn-ghost btn-small mt-2"
            onClick={() => {
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
