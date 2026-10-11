"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ERROR_RULES } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";

type Provider = "google" | "github";
const names = { google: "Google", github: "GitHub" };
export function SocialSignIn({ intent = "login" }: { intent?: "login" | "link" }) {
  const [providers, setProviders] = useState<{ provider: Provider; enabled: boolean }[] | null>(
    null
  );
  const [connections, setConnections] = useState<string[]>([]);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [callbackMessage, setCallbackMessage] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { error, run, clearError } = useAsyncError();

  // Sync provider availability, linked accounts and callback state from the server/browser URL.
  useEffect(() => {
    let active = true;
    clearError();
    const query = new URLSearchParams(window.location.search);
    const code = query.get("auth_error");
    setCallbackMessage(code?.startsWith("social_") ? ERROR_RULES[code]?.message : undefined);
    setConnected(intent === "link" && query.get("auth_connected") === "1");
    void run(
      async () => {
        const [available, linked] = await Promise.all([
          api.socialProviders(),
          intent === "link" ? api.socialConnections() : Promise.resolve({ connections: [] }),
        ]);
        if (active) {
          setProviders(available.providers);
          setConnections(linked.connections.map((item) => item.provider));
        }
        return true;
      },
      { fallback: "Couldn't load sign-in methods. Please retry." }
    );
    return () => {
      active = false;
    };
  }, [intent, attempt, run, clearError]);

  async function start(provider: Provider) {
    clearError();
    setBusy(provider);
    const from = new URLSearchParams(window.location.search).get("from") ?? undefined;
    const result = await run(() => api.startSocial(provider, { intent, from }));
    if (result) window.location.assign(result.url);
    else setBusy(null);
  }

  return (
    <div className="flex flex-col gap-2.5 text-left">
      <ErrorBanner message={error?.message ?? callbackMessage} />
      {connected && (
        <p role="status" className="m-0 text-sm text-[var(--color-ink-muted)]">
          Sign-in account connected.
        </p>
      )}
      {(["google", "github"] as const).map((provider) => {
        const linked = connections.includes(provider);
        const enabled = providers?.some((item) => item.provider === provider && item.enabled);
        return (
          <button
            key={provider}
            type="button"
            className="btn-base btn-ghost w-full justify-center"
            disabled={!enabled || linked || busy !== null}
            onClick={() => void start(provider)}
          >
            {busy === provider
              ? "Opening…"
              : linked
                ? `${names[provider]} connected`
                : `${intent === "link" ? "Connect" : "Continue with"} ${names[provider]}`}
          </button>
        );
      })}
      {!providers && !error && (
        <p role="status" className="m-0 text-center text-xs text-[var(--color-ink-muted)]">
          Loading sign-in methods…
        </p>
      )}
      {providers && providers.every((item) => !item.enabled) && (
        <p className="m-0 text-center text-xs text-[var(--color-ink-muted)]">
          Google and GitHub sign-in are currently unavailable.
        </p>
      )}
      {error && (
        <button
          type="button"
          className="btn-base btn-ghost"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry
        </button>
      )}
    </div>
  );
}
