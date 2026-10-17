"use client";
import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithRefresh, loadable } from "jotai/utils";
import { api, type TeamMember, type GitHubRepository } from "@/lib/api";
import type { SupportDetail, SupportSite, SupportTicket } from "@/lib/support-types";
import { normalizeError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
export function SupportTicketPanel({
  teamId,
  id,
  members,
  sites,
  onChanged,
  onStatusChanged,
}: {
  teamId: string;
  id: string;
  members: TeamMember[];
  sites: SupportSite[];
  onChanged: () => void;
  onStatusChanged: (status: SupportTicket["status"]) => void;
}) {
  const resource = useMemo(
    () =>
      atomWithRefresh(async (_get, { signal }) => {
        if (typeof window === "undefined") return null;
        return api.supportTicket(teamId, id, undefined, signal);
      }),
    [teamId, id]
  );
  const state = useAtomValue(useMemo(() => loadable(resource), [resource])),
    refresh = useSetAtom(resource);
  const { run, error, clearError } = useAsyncError();
  const [body, setBody] = useState(""),
    [internal, setInternal] = useState(false),
    [busy, setBusy] = useState(false),
    pending = useRef(false),
    requestId = useRef<string | null>(null);
  const [extra, setExtra] = useAtom(useMemo(() => atom<SupportDetail["messages"]>([]), []));
  const [cursor, setCursor] = useState<string | null | undefined>();
  const [repositories, setRepositories] = useState<GitHubRepository[] | null>(null),
    [repoId, setRepoId] = useState(""),
    [issueUrl, setIssueUrl] = useState<string | null>(null);
  async function action(operation: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    clearError();
    try {
      const result = await run(operation);
      if (result) {
        setExtra([]);
        setCursor(undefined);
        refresh();
      }
      return result;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reply(event: FormEvent) {
    event.preventDefault();
    requestId.current ??= crypto.randomUUID();
    const result = await action(() =>
      api.replySupportTicket(teamId, id, { request_id: requestId.current ?? "", body, internal })
    );
    if (result) {
      if (!internal) onStatusChanged("waiting");
      setBody("");
      requestId.current = null;
    }
  }
  if (state.state === "loading" || (state.state === "hasData" && !state.data))
    return (
      <section className="support-card" role="status">
        Loading ticket…
      </section>
    );
  if (state.state === "hasError")
    return (
      <section className="support-card">
        <ErrorBanner message={normalizeError(state.error).message} />
        <button className="btn-base btn-ghost mt-3" onClick={() => refresh()}>
          Retry
        </button>
      </section>
    );
  const data = state.data;
  if (!data) return null;
  const ticket = data.ticket,
    next = cursor === undefined ? data.next_cursor : cursor;
  const messages = [...new Map([...data.messages, ...extra].map((m) => [m.id, m])).values()];
  const patch = async (
    change: Partial<Pick<SupportTicket, "status" | "priority" | "assignee_id">>
  ) => {
    const result = await action(() => api.patchSupportTicket(teamId, id, change));
    if (result && change.status) onStatusChanged(change.status);
  };
  return (
    <section className="support-card">
      <div className="support-actions justify-between">
        <span className="support-muted font-mono">{ticket.reference}</span>
        <button className="btn-base btn-ghost btn-small" type="button" onClick={onChanged}>
          Refresh all
        </button>
      </div>
      <h1 className="mt-4 break-words">{ticket.subject}</h1>
      <p className="support-muted break-words">
        {ticket.customer_name} · {ticket.customer_email}
        <br />
        {sites.find((s) => s.id === ticket.site_id)?.name ?? "Website"} · {ticket.request_type} ·{" "}
        {ticket.area}
      </p>
      <div className="support-grid mb-5">
        <label className="support-field">
          Status
          <select
            disabled={busy}
            value={ticket.status}
            onChange={(e) => {
              const status = e.target.value;
              if (
                status === "open" ||
                status === "in_progress" ||
                status === "waiting" ||
                status === "resolved"
              )
                void patch({ status });
            }}
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="waiting">Waiting for customer</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label className="support-field">
          Priority
          <select
            disabled={busy}
            value={ticket.priority}
            onChange={(e) => {
              const priority = e.target.value;
              if (priority === "low" || priority === "medium" || priority === "high")
                void patch({ priority });
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="support-field">
          Assignee
          <select
            disabled={busy}
            value={ticket.assignee_id ?? ""}
            onChange={(e) => void patch({ assignee_id: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.username}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="whitespace-pre-wrap break-words support-divider">{ticket.details}</p>
      <div className="support-actions mb-5">
        {data.attachments.map((f) => (
          <a
            className="btn-base btn-ghost btn-small max-w-full"
            key={f.id}
            href={`/api/teams/${teamId}/files/${f.id}/download`}
          >
            <span className="truncate">{f.name}</span>
          </a>
        ))}
      </div>
      <div className="support-drop mb-6">
        <h2>Internal work</h2>
        <p className="support-muted">
          Create a linked task when this request needs work. Customer contact details and internal
          notes are excluded.
        </p>
        {ticket.task_id ? (
          <Link className="btn-base btn-ghost" href="/tasks">
            View workspace tasks
          </Link>
        ) : (
          <button
            type="button"
            className="btn-base btn-ghost"
            disabled={busy}
            onClick={() => void action(() => api.supportTicketTask(teamId, id))}
          >
            Create linked task
          </button>
        )}
        {ticket.task_id && (
          <div className="mt-3">
            {issueUrl ? (
              <a className="btn-base btn-ghost" href={issueUrl} target="_blank" rel="noreferrer">
                Open GitHub issue
              </a>
            ) : (
              <button
                type="button"
                className="btn-base btn-ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const task = await run(() => api.getTask(ticket.task_id ?? ""));
                    if (task?.github_issue?.issue_url) {
                      setIssueUrl(task.github_issue.issue_url);
                      return;
                    }
                    const integration = await run(() => api.getGitHubIntegration());
                    if (integration)
                      setRepositories(
                        integration.connection?.repositories.filter(
                          (r) => r.enabled && r.available
                        ) ?? []
                      );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Choose GitHub repository
              </button>
            )}
            {repositories && !issueUrl && (
              <div className="support-form mt-3">
                <p className="support-muted">
                  The task title and description will be sent to GitHub. Review the request before
                  sharing it outside Mokara.
                </p>
                {repositories.length ? (
                  <>
                    <label className="support-field">
                      Repository
                      <select value={repoId} onChange={(e) => setRepoId(e.target.value)}>
                        <option value="">Select a repository</option>
                        {repositories.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.full_name}
                            {r.private ? " · private" : " · public"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn-base btn-primary"
                      disabled={busy || !repoId}
                      onClick={async () => {
                        if (pending.current || !ticket.task_id) return;
                        pending.current = true;
                        setBusy(true);
                        try {
                          const published = await run(() =>
                            api.publishGitHubIssue(ticket.task_id ?? "", repoId)
                          );
                          if (published?.github_issue.issue_url)
                            setIssueUrl(published.github_issue.issue_url);
                        } finally {
                          pending.current = false;
                          setBusy(false);
                        }
                      }}
                    >
                      Create GitHub issue
                    </button>
                  </>
                ) : (
                  <p className="support-muted">
                    Connect and activate a GitHub repository in Settings first.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <h2>Activity</h2>
      <p className="support-muted">
        Latest customer email: {data.email_status}. Updates are sent by email; customers reply on
        their private ticket page.
      </p>
      {messages.map((m) => (
        <article key={m.id} className="support-message" data-internal={m.internal}>
          <div className="support-actions justify-between">
            <span className="font-medium">
              {m.author}
              {m.internal ? " · Internal note" : ""}
            </span>
            <time dateTime={m.created_at} className="support-muted">
              {new Date(m.created_at).toLocaleString()}
            </time>
          </div>
          <p>{m.body}</p>
        </article>
      ))}
      {next && (
        <button
          type="button"
          className="btn-base btn-ghost mt-3"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const page = await run(() => api.supportTicket(teamId, id, next));
              if (page) {
                setExtra((old) => [...old, ...page.messages]);
                setCursor(page.next_cursor);
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          Load more activity
        </button>
      )}
      {error && <ErrorBanner message={error.message} />}
      <form className="support-form mt-5" onSubmit={reply}>
        <label className="support-field">
          {internal ? "Internal note" : "Reply to customer"}
          <textarea
            required
            disabled={busy}
            value={body}
            maxLength={10000}
            onChange={(e) => {
              setBody(e.target.value);
              requestId.current = null;
            }}
          />
        </label>
        <label className="support-actions">
          <input
            type="checkbox"
            checked={internal}
            disabled={busy}
            onChange={(e) => {
              setInternal(e.target.checked);
              requestId.current = null;
            }}
          />{" "}
          Internal note · visible only to the workspace
        </label>
        <button className="btn-base btn-primary justify-self-end" disabled={busy}>
          {busy ? "Saving…" : internal ? "Save note" : "Send reply"}
        </button>
      </form>
    </section>
  );
}
