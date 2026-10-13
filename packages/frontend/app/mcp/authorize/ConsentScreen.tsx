"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { McpPermissions } from "@/components/McpPermissions";
import type { McpScope } from "@/lib/mcp-permissions";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { tileIn } from "@/lib/motion";

type Consent = Awaited<ReturnType<typeof api.mcpConsent>>;
export function ConsentScreen() {
  const request = useSearchParams().get("request") ?? "";
  const session = useSession();
  const { error, run, clearError } = useAsyncError();
  const [snapshot, setSnapshot] = useState<{
    request: string;
    userId: string;
    consent: Consent;
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [scopes, setScopes] = useState<McpScope[]>(["mokara:read"]);
  const [repositories, setRepositories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const from = `/mcp/authorize?request=${encodeURIComponent(request)}`;
  const userId = session.status === "authed" ? session.user.id : null;
  const data =
    snapshot?.request === request && snapshot.userId === userId ? snapshot.consent : null;
  // Synchronize the browser-bound server consent snapshot after authentication.
  // It cannot be derived locally; cancel reads when the request or user changes.
  useEffect(() => {
    if (!userId || !request) return;
    const controller = new AbortController();
    clearError();
    void run(() => api.mcpConsent(request, controller.signal), {
      signal: controller.signal,
      loginFrom: from,
    }).then((result) => {
      if (result && !controller.signal.aborted) {
        setSnapshot({ request, userId, consent: result });
        setSelected([]);
        setScopes(["mokara:read"]);
        setRepositories([]);
      }
    });
    return () => {
      controller.abort();
      mutation.current?.abort();
    };
  }, [request, userId, from, run, clearError]);
  const allowed = selected.filter((id) =>
    data?.workspaces.some((workspace) => workspace.id === id)
  );
  async function decide(approve: boolean) {
    if (pending.current || !data || (approve && !allowed.length)) return;
    pending.current = true;
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    clearError();
    try {
      const result = await run(
        () =>
          api.approveMcp(
            {
              request,
              approve,
              workspace_ids: approve ? allowed : [],
              scopes: approve ? scopes : ["mokara:read"],
              repository_ids: approve && scopes.includes("mokara:github") ? repositories : [],
            },
            controller.signal
          ),
        { loginFrom: from, signal: controller.signal }
      );
      if (result) window.location.assign(result.url);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center px-5 py-10">
      <Link
        href="/"
        className="mb-6 self-start text-lg font-medium tracking-tight text-[var(--color-ink)] no-underline"
      >
        Mokara
      </Link>
      <motion.section
        variants={tileIn}
        initial="hidden"
        animate="show"
        className="card min-w-0 p-6 sm:p-9"
        aria-labelledby="consent-title"
      >
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--color-accent)]">
          AI connection
        </p>
        <h1 id="consent-title" className="m-0 text-3xl font-medium tracking-tight">
          Connect your agent
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--color-ink-muted)]">
          Choose what this agent can read. You can remove its access at any time in Settings.
        </p>
        {!request ? (
          <p role="alert">This request is missing. Start a new connection from your agent.</p>
        ) : session.status === "anonymous" ? (
          <Link
            className="btn-base btn-primary mt-5 min-h-12 w-full"
            href={`/login?from=${encodeURIComponent(from)}`}
          >
            Sign in to continue
          </Link>
        ) : session.status === "error" ? (
          <>
            <ErrorBanner message={session.error.message} />
            <button className="btn-base btn-ghost mt-3" onClick={() => void session.refresh()}>
              Try again
            </button>
          </>
        ) : session.status !== "authed" ? (
          <p role="status">Checking your account…</p>
        ) : (
          <>
            <p className="my-5 text-sm text-[var(--color-ink-muted)]">
              Signed in as{" "}
              <span className="text-[var(--color-ink)]">
                {session.user.display_name || session.user.username}
              </span>
            </p>
            {data ? (
              <>
                <div className="rounded-[var(--radius-btn)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4">
                  <p className="m-0 text-base font-medium break-words">{data.client.name}</p>
                  <p className="mb-3 mt-1 text-xs text-[var(--color-ink-muted)]">
                    Client name is supplied by the agent and has not been verified by Mokara.
                  </p>
                  <dl className="m-0 grid gap-2 text-xs leading-5">
                    <div>
                      <dt className="text-[var(--color-ink-muted)]">Client ID</dt>
                      <dd className="m-0 break-all font-mono">{data.client.id}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--color-ink-muted)]">Return address</dt>
                      <dd className="m-0 break-all">{data.client.redirect_uri}</dd>
                    </div>
                  </dl>
                </div>
                <p className="mb-1 mt-5 text-sm font-medium">Selected permissions · 30 days</p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
                  Read access is included. Writing, deleting and GitHub access require your explicit
                  selection below.
                </p>
                <McpPermissions
                  scopes={scopes}
                  onScopesChange={setScopes}
                  repositories={data.repositories}
                  selectedRepositories={repositories}
                  onRepositoriesChange={setRepositories}
                  availableScopes={data.requested_scopes}
                  disabled={busy}
                />
                {data.requested_scopes.length === 1 && (
                  <p className="text-xs leading-5 text-[var(--color-ink-muted)]">
                    This client requested read-only access. To enable writes, reconnect from the
                    client with the write permissions requested.
                  </p>
                )}
                <fieldset disabled={busy} className="my-5 min-w-0">
                  <legend className="mb-3 text-sm font-medium">Allow access to</legend>
                  <div className="grid max-h-64 gap-2 overflow-auto">
                    {data.workspaces.map((workspace) => (
                      <label
                        key={workspace.id}
                        className="flex min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-btn)] border border-[var(--color-border-soft)] px-4 py-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-[var(--color-accent)]"
                          checked={selected.includes(workspace.id)}
                          disabled={!selected.includes(workspace.id) && selected.length >= 20}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, workspace.id]
                                : current.filter((id) => id !== workspace.id)
                            )
                          }
                        />
                        <span className="break-words">{workspace.name}</span>
                      </label>
                    ))}
                  </div>
                  {!data.workspaces.length && (
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      You need a workspace before you can connect an agent.
                    </p>
                  )}
                  <p className="mb-0 mt-2 text-xs text-[var(--color-ink-muted)]">
                    Select up to 20 workspaces.
                  </p>
                </fieldset>
                <ErrorBanner message={error?.message} />
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    disabled={busy}
                    className="btn-base btn-ghost min-h-11 flex-1"
                    onClick={() => void decide(false)}
                  >
                    Deny
                  </button>
                  <button
                    disabled={
                      busy ||
                      !allowed.length ||
                      (scopes.includes("mokara:github") && !repositories.length)
                    }
                    className="btn-base btn-primary min-h-11 flex-1"
                    onClick={() => void decide(true)}
                  >
                    {busy ? "Connecting…" : "Allow selected access"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <ErrorBanner message={error?.message} />
                {!error && <p role="status">Loading connection request…</p>}
              </>
            )}
          </>
        )}
      </motion.section>
    </main>
  );
}
