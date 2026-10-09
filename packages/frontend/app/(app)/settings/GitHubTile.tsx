"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type GitHubIntegration } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { tileIn } from "@/lib/motion";
import { motion } from "framer-motion";
import { TILE, TileHeader } from "./settings-chrome";

type Run = ReturnType<typeof useAsyncError>["run"];

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.2 19.2c-4 .9-4-2-5.6-2.5m11.2 5v-3.5c0-1 .1-1.5-.5-2.1 2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.2-3.2 4.4 4.4 0 0 0-.1-3.2s-1-.3-3.4 1.2a11.8 11.8 0 0 0-6.2 0C5.5 3.4 4.5 3.7 4.5 3.7a4.4 4.4 0 0 0-.1 3.2 4.7 4.7 0 0 0-1.2 3.2c0 4.7 2.8 5.7 5.5 6-.5.5-.6 1-.5 2.1v3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GitHubTile({ run }: { run: Run }) {
  const [integration, setIntegration] = useState<GitHubIntegration | null>(null);
  const [busy, setBusy] = useState(false);
  const [callbackMessage, setCallbackMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await run(() => api.getGitHubIntegration(), {
      fallback: "Couldn't load the GitHub connection.",
    });
    if (data) setIntegration(data);
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  // The GitHub callback is a top-level browser navigation. Read its small,
  // non-sensitive result once, then clean the URL so a refresh does not repeat
  // stale feedback.
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("github");
    if (!result) return;
    const messages: Record<string, string> = {
      connected: "GitHub connected.",
      denied: "GitHub access was denied.",
      state_expired: "That GitHub connection attempt expired. Start again.",
      installation_unverified: "That GitHub installation could not be verified.",
      failed: "GitHub could not be connected. Try again.",
    };
    setCallbackMessage(messages[result] ?? "GitHub connection finished.");
    url.searchParams.delete("github");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const navigate = async (kind: "connect" | "install") => {
    setBusy(true);
    const result = await run(kind === "connect" ? api.connectGitHub : api.installGitHub, {
      fallback: "Couldn't start the GitHub connection.",
    });
    setBusy(false);
    if (result) window.location.assign(result.url);
  };

  const refresh = async () => {
    setBusy(true);
    const result = await run(() => api.refreshGitHub(), {
      fallback: "Couldn't refresh GitHub repositories.",
    });
    setBusy(false);
    if (result) window.location.assign(result.url);
  };

  const disconnect = async () => {
    if (!confirm("Disconnect your GitHub account from Mokara? Existing issue links will remain.")) {
      return;
    }
    setBusy(true);
    const result = await run(() => api.disconnectGitHub(), {
      fallback: "Couldn't disconnect GitHub.",
    });
    setBusy(false);
    if (result !== null) await load();
  };

  return (
    <motion.section variants={tileIn} className={`${TILE} col-span-12`}>
      <TileHeader
        icon={<GitHubIcon />}
        title="GitHub"
        caption="Publish selected tasks to repositories connected by you"
        right={
          integration?.connection ? (
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-success-soft)] px-2.5 py-1 text-[0.76rem] font-semibold text-[var(--color-success)]">
              @{integration.connection.github_login}
            </span>
          ) : null
        }
      />

      {callbackMessage && (
        <p role="status" className="mb-0 mt-3 text-[0.82rem] text-[var(--color-ink-muted)]">
          {callbackMessage}
        </p>
      )}

      {integration === null ? (
        <p className="mb-0 mt-4 text-[0.85rem] text-[var(--color-ink-faint)]">
          Loading GitHub connection…
        </p>
      ) : !integration.configured ? (
        <p className="mb-0 mt-4 text-[0.85rem] text-[var(--color-ink-muted)]">
          GitHub integration is not configured on this instance.
        </p>
      ) : !integration.connection ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-[620px] text-[0.85rem] leading-relaxed text-[var(--color-ink-muted)]">
            Connect your own GitHub account. Mokara receives access only to repositories selected in
            the GitHub App installation, and task publishing remains opt-in.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => navigate("connect")}
            className="btn-base btn-primary"
          >
            Connect GitHub
          </button>
        </div>
      ) : (
        <>
          <ul className="m-0 mt-4 flex max-h-[190px] list-none flex-col overflow-y-auto p-0">
            {integration.connection.repositories.length === 0 ? (
              <li className="py-2 text-[0.85rem] text-[var(--color-ink-faint)]">
                {integration.connection.reauthorization_required
                  ? "Reconnect GitHub to verify your repository access."
                  : "No repositories are available yet. Install the app or grant it repository access."}
              </li>
            ) : (
              integration.connection.repositories.map((repository) => (
                <li
                  key={repository.id}
                  className="flex items-center justify-between gap-3 border-t border-[var(--color-border-soft)] py-2 first:border-t-0"
                >
                  <span className="min-w-0 truncate text-[0.88rem] font-semibold">
                    {repository.full_name}
                  </span>
                  <span className="shrink-0 text-[0.74rem] text-[var(--color-ink-faint)]">
                    {repository.private ? "Private" : "Public"} · {repository.installation_account}
                  </span>
                </li>
              ))
            )}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => navigate("install")}
              className="btn-base btn-primary btn-small"
            >
              Add repositories
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={refresh}
              className="btn-base btn-ghost btn-small"
            >
              {integration.connection.reauthorization_required ? "Reconnect" : "Refresh"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={disconnect}
              className="btn-base btn-ghost btn-small ml-auto text-[var(--color-danger)]"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </motion.section>
  );
}
