"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { McpPermissions } from "@/components/McpPermissions";
import { MCP_PERMISSIONS, type McpScope } from "@/lib/mcp-permissions";
import { api, type McpConnection, type TeamWithRole } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { tileIn } from "@/lib/motion";
import Link from "next/link";
import { ConnectionFilters } from "./ConnectionFilters";
import { filterAgentConnections, type AgentFilter } from "./connection-filters";
import { TILE, TileHeader } from "./settings-chrome";

export function AIConnectionsTile({ containers }: { containers: TeamWithRole[] }) {
  const { error, run, clearError } = useAsyncError();
  const [connections, setConnections] = useState<McpConnection[] | null>(null);
  const [filter, setFilter] = useState<AgentFilter>("all");
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "pending" | "failed" | "succeeded">(
    "all"
  );
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [scopes, setScopes] = useState<McpScope[]>(["mokara:read"]);
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
        const [connections, activity] = await Promise.all([
          api.listMcpConnections(controller.signal),
          api.listMcpActivity(controller.signal),
        ]);
        return { ...connections, ...activity };
      },
      {
        signal: controller.signal,
      }
    );
    if (data) {
      setConnections(data.connections);
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
        setFilter("all");
        setSearch("");
        setName("");
        setSelected([]);
        setScopes(["mokara:read"]);
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

  const workspaceNames = new Map(containers.map((container) => [container.id, container.name]));
  const visibleConnections = filterAgentConnections(
    connections ?? [],
    filter,
    search,
    workspaceNames
  );
  const visibleActivity = activity.filter(
    (row) => activityFilter === "all" || row.status === activityFilter
  );
  const writeCount = connections?.filter((connection) => connection.access === "write").length ?? 0;

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
      <div className="connection-summary">
        <p>
          Choose what your agents can access. Review permissions and revoke a connection anytime.
        </p>
        <Link href="/docs/mcp" className="text-xs text-[var(--color-accent)]">
          Connection guide ↗
        </Link>
      </div>
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
          <p role="status" className="connection-row-meta mt-4">
            Loading connections…
          </p>
        )
      ) : (
        <>
          <ConnectionFilters
            label="Filter active AI connections"
            value={filter}
            onChange={setFilter}
            search={search}
            onSearch={setSearch}
            placeholder="Search agents or workspaces…"
            options={[
              { value: "all", label: "Active", count: connections.length },
              { value: "write", label: "Can write", count: writeCount },
              { value: "read", label: "Read only", count: connections.length - writeCount },
            ]}
          />
          {!visibleConnections.length ? (
            <div className="connection-empty">
              <p>
                {connections.length
                  ? "No connections match this view."
                  : "No active agents yet. Connect from your agent or create a manual token below."}
              </p>
              {connections.length > 0 && (
                <button
                  type="button"
                  className="btn-base btn-ghost btn-small"
                  onClick={() => {
                    setFilter("all");
                    setSearch("");
                  }}
                >
                  Show all active connections
                </button>
              )}
            </div>
          ) : (
            <div
              className="connection-scroll"
              role="region"
              aria-label="Active AI connections"
              tabIndex={0}
            >
              <ul className="connection-list">
                {visibleConnections.map((connection) => (
                  <li key={connection.id} className="connection-row">
                    <div className="connection-row-main">
                      <span className="connection-row-icon">
                        <AgentIcon />
                      </span>
                      <div className="min-w-0">
                        <p className="connection-row-title">{connection.name}</p>
                        <p className="connection-row-meta">
                          {connection.workspace_ids
                            .map((id) => workspaceNames.get(id) ?? id)
                            .join(", ")}{" "}
                          · Expires {new Date(connection.expires_at).toLocaleDateString()}
                        </p>
                        <p className="connection-row-meta">
                          {MCP_PERMISSIONS.filter((permission) =>
                            connection.scopes.includes(permission.scope)
                          )
                            .map((permission) => permission.title)
                            .join(" · ")}
                          {connection.scopes.includes("mokara:github")
                            ? " · Follows active GitHub repositories"
                            : ""}
                        </p>
                      </div>
                    </div>
                    <span className="connection-status" data-status="active">
                      {connection.access === "write" ? "Can write" : "Read only"}
                    </span>
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
            </div>
          )}
          <p className="connection-row-meta mt-2">
            Only active connections are listed. Expired and revoked connections no longer have
            access.
          </p>
        </>
      )}
      {issued && (
        <div className="my-4 rounded-[var(--radius-btn)] border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-4">
          <p role="status" className="mt-0 text-sm font-medium">
            Connection created. Save this token now.
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            It is shown once. Store it in your agent’s secret settings and use the Authorization
            header below. Anyone with this token can use the permissions you granted in the selected
            workspaces.
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
      <details className="connection-disclosure">
        <summary>
          <span>
            Create a manual connection<small>For agents that accept a bearer token</small>
          </span>
        </summary>
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
            <McpPermissions scopes={scopes} onScopesChange={setScopes} disabled={busy} />
            <fieldset className="m-0 mt-4 min-w-0 border-0 p-0">
              <legend className="text-xs">Workspaces · choose up to 20</legend>
              <div className="connection-scroll mt-2 grid max-h-48 gap-2 sm:grid-cols-2">
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
              disabled={!name.trim() || allowedIds.length === 0}
            >
              {busy ? "Working…" : "Create connection"}
            </button>
          </fieldset>
        </form>
      </details>
      <details className="connection-disclosure">
        <summary>
          <span>
            Recent agent activity
            <small>
              Latest {activity.length} writes ·{" "}
              {activity.filter((row) => row.status === "pending").length} pending or uncertain
            </small>
          </span>
        </summary>
        <ConnectionFilters
          label="Filter agent activity"
          value={activityFilter}
          onChange={setActivityFilter}
          options={[
            { value: "all", label: "All", count: activity.length },
            {
              value: "pending",
              label: "Pending",
              count: activity.filter((row) => row.status === "pending").length,
            },
            {
              value: "failed",
              label: "Failed",
              count: activity.filter((row) => row.status === "failed").length,
            },
            {
              value: "succeeded",
              label: "Completed",
              count: activity.filter((row) => row.status === "succeeded").length,
            },
          ]}
        />
        <p className="mt-1 text-xs leading-5 text-[var(--color-ink-muted)]">
          Pending can mean an uncertain result. Inspect the affected work before retrying. Refresh
          to update activity.
        </p>
        {!visibleActivity.length ? (
          <p className="text-xs text-[var(--color-ink-muted)]">No writes in this view.</p>
        ) : (
          <ul
            className="connection-scroll m-0 list-none divide-y divide-[var(--color-border-soft)] p-0"
            tabIndex={0}
            aria-label="Recent agent writes"
          >
            {visibleActivity.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3 text-xs">
                <div className="min-w-0">
                  <p className="m-0 font-medium">
                    {row.operation.replaceAll("_", " ")}{" "}
                    <span className="connection-status" data-status={row.status}>
                      {row.status === "succeeded" ? "Completed" : row.status}
                    </span>
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
      </details>
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
