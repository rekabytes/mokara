"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type GitHubIntegration } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { tileIn } from "@/lib/motion";
import { motion } from "framer-motion";
import { TILE, TileHeader } from "./settings-chrome";
import { ErrorBanner } from "@/components/ErrorBanner";

import { ConnectionFilters } from "./ConnectionFilters";
import { filterRepositories, repositoryStatus, type RepositoryFilter } from "./connection-filters";

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
  const { error: loadError, run: runLoad, clearError: clearLoadError } = useAsyncError();
  const [integration, setIntegration] = useState<GitHubIntegration | null>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<RepositoryFilter>("active");
  const [search, setSearch] = useState("");
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [callbackMessage, setCallbackMessage] = useState<string | null>(null);

  const read = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    clearLoadError();
    const data = await runLoad(() => api.getGitHubIntegration(controller.signal), {
      fallback: "Couldn't load the GitHub connection.",
      signal: controller.signal,
    });
    if (data) {
      setIntegration(data);
      const active =
        data.connection?.repositories
          .filter((repository) => repository.enabled && repository.available)
          .map((repository) => repository.id) ?? [];
      setSelected(active);
      if (data.connection && active.length === 0) {
        setManaging(true);
        setFilter("all");
      }
    }
  }, [runLoad, clearLoadError]);

  // External repository snapshot; an obsolete response must not replace the
  // current selection or report errors after Settings unmounts.
  useEffect(() => {
    void load();
    return () => read.current?.abort();
  }, [load]);

  // The GitHub callback is a top-level browser navigation. Read its small,
  // non-sensitive result once, then clean the URL so a refresh does not repeat
  // stale feedback.
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("github");
    if (!result) return;
    const messages: Record<string, string> = {
      connected: "GitHub connected. Choose up to three active repositories below.",
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
    if (pending.current) return;
    pending.current = true;
    read.current?.abort();
    setBusy(true);
    try {
      const result = await run(kind === "connect" ? api.connectGitHub : api.installGitHub, {
        fallback: "Couldn't start the GitHub connection.",
      });
      if (result) window.location.assign(result.url);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (pending.current) return;
    pending.current = true;
    read.current?.abort();
    setBusy(true);
    try {
      const result = await run(() => api.refreshGitHub(), {
        fallback: "Couldn't refresh GitHub repositories.",
      });
      if (result) window.location.assign(result.url);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (pending.current) return;
    if (!confirm("Disconnect your GitHub account from Mokara? Existing issue links will remain.")) {
      return;
    }
    pending.current = true;
    read.current?.abort();
    setBusy(true);
    try {
      const result = await run(() => api.disconnectGitHub(), {
        fallback: "Couldn't disconnect GitHub.",
      });
      if (result !== null) await load();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const saveRepositories = async () => {
    if (pending.current) return;
    pending.current = true;
    read.current?.abort();
    setBusy(true);
    try {
      const data = await run(() => api.setGitHubRepositories(selected), {
        fallback: "Couldn't save active repositories.",
      });
      if (data) {
        read.current?.abort();
        setIntegration(data);
        setManaging(false);
        setFilter("active");
        setSearch("");
        setCallbackMessage("Active repositories saved.");
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const repositories = integration?.connection?.repositories ?? [];
  const visibleRepositories = filterRepositories(repositories, filter, search);
  const activeCount = repositories.filter(
    (repository) => repositoryStatus(repository) === "active"
  ).length;

  return (
    <motion.section variants={tileIn} className={`${TILE} col-span-12`}>
      <TileHeader
        icon={<GitHubIcon />}
        title="GitHub"
        caption="Choose active repositories and sync linked task statuses"
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

      <ErrorBanner className="mt-3" message={loadError?.message} />
      {loadError && (
        <button type="button" className="btn-base btn-ghost mt-2" onClick={() => void load()}>
          Retry GitHub connection
        </button>
      )}
      {integration === null ? (
        !loadError && (
          <p className="mb-0 mt-4 text-[0.85rem] text-[var(--color-ink-faint)]">
            Loading GitHub connection…
          </p>
        )
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
          <div className="connection-summary">
            <p>
              <strong>
                {managing ? selected.length : activeCount} / {integration.repository_limit}
              </strong>{" "}
              {managing ? "selected" : "active"} repositories
            </p>
            <p>{repositories.length} repositories from GitHub</p>
          </div>
          {integration.connection.reauthorization_required && (
            <p role="status" className="mb-0 mt-2 text-[0.82rem] text-[var(--color-ink-muted)]">
              Reconnect to verify access and resume sync.
            </p>
          )}
          {!integration.sync_configured && (
            <p role="status" className="mb-0 mt-2 text-[0.82rem] text-[var(--color-ink-muted)]">
              Incoming status sync needs the GitHub webhook configured by this instance&apos;s
              operator.
            </p>
          )}
          <ConnectionFilters
            label="Filter GitHub repositories"
            value={filter}
            onChange={setFilter}
            search={search}
            onSearch={setSearch}
            placeholder="Search repositories…"
            options={[
              { value: "active", label: "Active", count: activeCount },
              { value: "all", label: "All", count: repositories.length },
              {
                value: "inactive",
                label: "Inactive",
                count: repositories.filter(
                  (repository) => repositoryStatus(repository) === "inactive"
                ).length,
              },
              {
                value: "unavailable",
                label: "Unavailable",
                count: repositories.filter(
                  (repository) => repositoryStatus(repository) === "unavailable"
                ).length,
              },
            ]}
          />
          {managing && (
            <p className="connection-row-meta">
              Choose up to {integration.repository_limit} repositories. Selections are kept when you
              search or switch filters. Save to apply.
            </p>
          )}
          {!visibleRepositories.length ? (
            <div className="connection-empty">
              <p>
                {repositories.length
                  ? "No repositories match this view."
                  : "No repositories are available. Grant repository access on GitHub to get started."}
              </p>
              {repositories.length > 0 && (
                <button
                  type="button"
                  className="btn-base btn-ghost btn-small"
                  onClick={() => {
                    setFilter("all");
                    setSearch("");
                  }}
                >
                  Show all repositories
                </button>
              )}
            </div>
          ) : (
            <div
              className="connection-scroll"
              role="region"
              aria-label="GitHub repositories"
              tabIndex={0}
            >
              <ul className="connection-list">
                {visibleRepositories.map((repository) => (
                  <li key={repository.id} className="connection-row">
                    <label className="connection-row-main">
                      {managing ? (
                        <input
                          type="checkbox"
                          checked={selected.includes(repository.id)}
                          disabled={
                            busy ||
                            integration.connection?.reauthorization_required ||
                            !repository.available ||
                            (!selected.includes(repository.id) &&
                              selected.length >= integration.repository_limit)
                          }
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setSelected((previous) =>
                              checked
                                ? [...previous, repository.id]
                                : previous.filter((id) => id !== repository.id)
                            );
                          }}
                          className="accent-[var(--color-accent)]"
                        />
                      ) : (
                        <span className="connection-row-icon">
                          <GitHubIcon />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="connection-row-title">{repository.full_name}</span>
                        <span className="connection-row-meta block">
                          {repository.private ? "Private" : "Public"} ·{" "}
                          {repository.installation_account}
                        </span>
                      </span>
                    </label>
                    <span className="connection-status" data-status={repositoryStatus(repository)}>
                      {managing && selected.includes(repository.id)
                        ? "Selected"
                        : repositoryStatus(repository)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {managing ? (
              <>
                <button
                  type="button"
                  disabled={busy || integration.connection.reauthorization_required}
                  onClick={saveRepositories}
                  className="btn-base btn-primary btn-small"
                >
                  {busy ? "Saving…" : "Save repositories"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setManaging(false);
                    setFilter("active");
                    setSearch("");
                  }}
                  className="btn-base btn-ghost btn-small"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelected(
                    integration.connection?.repositories
                      .filter((repository) => repository.enabled && repository.available)
                      .map((repository) => repository.id) ?? []
                  );
                  setManaging(true);
                  setFilter("all");
                  setSearch("");
                }}
                className="btn-base btn-primary btn-small"
              >
                Manage repositories
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => navigate("install")}
              className="btn-base btn-ghost btn-small"
            >
              GitHub repository access
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
