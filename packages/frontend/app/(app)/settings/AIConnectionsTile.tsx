"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { McpPermissions } from "@/components/McpPermissions";
import { MCP_PERMISSIONS, type McpScope, type McpRepository } from "@/lib/mcp-permissions";
import { api, type McpConnection, type TeamWithRole } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { tileIn } from "@/lib/motion";
import { TILE, TileHeader } from "./settings-chrome";

export function AIConnectionsTile({ containers }: { containers: TeamWithRole[] }) {
  const { error, run, clearError } = useAsyncError();
  const [connections, setConnections] = useState<McpConnection[] | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [scopes, setScopes] = useState<McpScope[]>(["mokara:read"]);
  const [repositories, setRepositories] = useState<McpRepository[]>([]);
  const [repositoryIds, setRepositoryIds] = useState<string[]>([]);
  const [activity, setActivity] = useState<
    Awaited<ReturnType<typeof api.listMcpActivity>>["activity"]
  >([]);
  const [days, setDays] = useState(30);
  const [issued, setIssued] = useState<{ id: string; token: string; endpoint: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const read = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    clearError();
    const data = await run(
      async () => {
        const [connections, repositories, activity] = await Promise.all([
          api.listMcpConnections(controller.signal),
          api.listMcpRepositories(controller.signal),
          api.listMcpActivity(controller.signal),
        ]);
        return { ...connections, ...repositories, ...activity };
      },
      {
        signal: controller.signal,
      }
    );
    if (data) {
      setConnections(data.connections);
      setRepositories(data.repositories);
      setActivity(data.activity);
    }
  }, [run, clearError]);

  // Settings must synchronize its initial connection snapshot with the server.
  // This is not a user-triggered action; cancel obsolete reads on unmount.
  useEffect(() => {
    void load();
    return () => read.current?.abort();
  }, [load]);

  const allowedIds = selected.filter((id) => containers.some((container) => container.id === id));
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || !name.trim() || allowedIds.length === 0 || issued) return;
    pending.current = true;
    read.current?.abort();
    setBusy(true);
    clearError();
    try {
      const data = await run(
        () =>
          api.createMcpConnection({
            name: name.trim(),
            workspace_ids: allowedIds,
            expires_in_days: days,
            scopes,
            repository_ids: scopes.includes("mokara:github") ? repositoryIds : [],
          }),
        {
          fallback: "Couldn't create the connection. Reload the list before trying again.",
        }
      );
      if (data) {
        // The secret exists only in this component's memory, never browser storage.
        setIssued({
          id: data.connection.id,
          token: data.token,
          endpoint: new URL("/api/mcp", window.location.href).href,
        });
        setConnections((current) => [data.connection, ...(current ?? [])]);
        setName("");
        setSelected([]);
        setScopes(["mokara:read"]);
        setRepositoryIds([]);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    if (pending.current) return;
    pending.current = true;
    read.current?.abort();
    setBusy(true);
    clearError();
    try {
      const data = await run(() => api.revokeMcpConnection(id));
      if (data !== null) {
        setConnections((current) => current?.filter((connection) => connection.id !== id) ?? null);
        setIssued((current) => (current?.id === id ? null : current));
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <motion.section variants={tileIn} className={`${TILE} col-span-12 min-w-0`}>
      <TileHeader
        icon={<AgentIcon />}
        title="AI connections"
        caption="Review agent access or create a manual connection"
        right={
          <button
            type="button"
            className="btn-base btn-ghost btn-small"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh
          </button>
        }
      />
      <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
        Connect an MCP-compatible agent to read tasks, projects, members and comments. Connections
        can only use the permissions and workspaces you approve. Existing connections stay read-only
        until you reconnect. In your agent, add this site’s /api/mcp URL and choose Sign in with
        Mokara. Review and approve its workspace access in the browser.
      </p>
      <ErrorBanner message={error?.message} />
      {error && (
        <button
          type="button"
          className="btn-base btn-ghost mt-2"
          disabled={busy}
          onClick={() => void load()}
        >
          Reload connections
        </button>
      )}
      {connections === null ? (
        !error && (
          <p role="status" className="text-sm text-[var(--color-ink-muted)]">
            Loading connections…
          </p>
        )
      ) : connections.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">No active connections.</p>
      ) : (
        <ul className="my-4 list-none divide-y divide-[var(--color-border-soft)] p-0">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="m-0 break-words text-sm font-medium">{connection.name}</p>
                <p className="m-0 text-xs text-[var(--color-ink-muted)]">
                  {connection.workspace_ids.length} workspace
                  {connection.workspace_ids.length === 1 ? "" : "s"} ·{" "}
                  {connection.access === "write" ? "Selected write access" : "Read only"} · Expires{" "}
                  {new Date(connection.expires_at).toLocaleDateString()}
                </p>
                <p className="m-0 mt-1 text-xs text-[var(--color-ink-muted)]">
                  {MCP_PERMISSIONS.filter((permission) =>
                    connection.scopes.includes(permission.scope)
                  )
                    .map((permission) => permission.title)
                    .join(" · ")}
                  {connection.repository_ids.length
                    ? ` · ${connection.repository_ids.length} approved repositories`
                    : ""}
                </p>
                <p className="m-0 mt-1 break-words text-xs text-[var(--color-ink-muted)]">
                  {connection.workspace_ids
                    .map((id) => containers.find((container) => container.id === id)?.name ?? id)
                    .join(", ")}
                </p>
              </div>
              <button
                type="button"
                className="btn-base btn-ghost btn-small text-[var(--color-danger-ink)]"
                disabled={busy}
                onClick={() => void revoke(connection.id)}
                aria-label={`Revoke ${connection.name}`}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {issued && (
        <div className="my-4 rounded-[var(--radius-btn)] border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-4">
          <p role="status" className="mt-0 text-sm font-medium">
            Connection created. Save this token now.
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            It is shown once. Store it in your agent’s secret settings and use the Authorization
            header below. Anyone with this token can read the workspaces you selected.
          </p>
          <label className="block text-xs">
            MCP endpoint
            <input
              className="field mt-1 w-full font-mono text-xs"
              value={issued.endpoint}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <label className="mt-3 block text-xs">
            Authorization header
            <textarea
              className="field mt-1 min-h-20 w-full resize-y break-all font-mono text-xs"
              value={`Bearer ${issued.token}`}
              readOnly
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            type="button"
            className="btn-base btn-ghost btn-small mt-3"
            onClick={() => setIssued(null)}
          >
            I saved the token
          </button>
        </div>
      )}
      <form onSubmit={(event) => void create(event)} className="mt-4">
        <fieldset
          disabled={busy || issued !== null || connections === null}
          className="m-0 min-w-0 border-0 p-0 disabled:opacity-60"
        >
          <legend className="mb-3 text-sm font-medium">Manual token connection</legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <label className="text-xs">
              Connection name
              <input
                className="field mt-1 w-full"
                placeholder="My coding agent"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
              />
            </label>
            <label className="text-xs">
              Expires after
              <select
                className="field mt-1 w-full"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
          </div>
          <McpPermissions
            scopes={scopes}
            onScopesChange={setScopes}
            repositories={repositories}
            selectedRepositories={repositoryIds}
            onRepositoriesChange={setRepositoryIds}
            disabled={busy}
          />
          <fieldset className="m-0 mt-4 min-w-0 border-0 p-0">
            <legend className="text-xs">Workspaces · choose up to 20</legend>
            <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
              {containers.map((container) => (
                <label key={container.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allowedIds.includes(container.id)}
                    disabled={!allowedIds.includes(container.id) && allowedIds.length >= 20}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setSelected((current) =>
                        checked
                          ? [...current, container.id]
                          : current.filter((id) => id !== container.id)
                      );
                    }}
                  />
                  <span className="truncate">{container.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className="btn-base btn-primary mt-4"
            disabled={
              !name.trim() ||
              allowedIds.length === 0 ||
              (scopes.includes("mokara:github") && !repositoryIds.length)
            }
          >
            {busy ? "Working…" : "Create connection"}
          </button>
        </fieldset>
      </form>
      <div className="mt-6 border-t border-[var(--color-border-soft)] pt-4">
        <h3 className="m-0 text-sm font-medium">Recent agent writes · latest 50</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--color-ink-muted)]">
          Pending can mean an uncertain result. Inspect the affected work before retrying. Refresh
          to update activity.
        </p>
        {!activity.length ? (
          <p className="text-xs text-[var(--color-ink-muted)]">No recorded writes.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-[var(--color-border-soft)] p-0">
            {activity.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3 text-xs">
                <div className="min-w-0">
                  <p className="m-0 font-medium">
                    {row.operation} · {row.status}
                  </p>
                  <p className="m-0 mt-1 break-all text-[var(--color-ink-muted)]">
                    {connections?.find((connection) => connection.id === row.connection_id)?.name ??
                      row.connection_id}{" "}
                    · Request {row.request_id}
                  </p>
                </div>
                <time dateTime={row.created_at} className="text-[var(--color-ink-muted)]">
                  {new Date(row.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.section>
  );
}
function AgentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="4" y="7" width="16" height="13" rx="3" />
      <path d="M12 3v4M8 12h.01M16 12h.01M8 16h8" strokeLinecap="round" />
    </svg>
  );
}
