"use client";
import { SupportSelect } from "@/components/support/SupportSelect";

import { useMemo, useState } from "react";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithRefresh, loadable } from "jotai/utils";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SupportSites } from "./SupportSites";
import { SupportTicketPanel } from "./SupportTicketPanel";
import type { SupportTicket } from "@/lib/support-types";
export function SupportInbox({ teamId, name }: { teamId: string; name: string }) {
  const resource = useMemo(
    () =>
      atomWithRefresh(async (_get, { signal }) => {
        if (typeof window === "undefined") return null;
        const [sites, tickets, team] = await Promise.all([
          api.supportSites(teamId, signal),
          api.supportTickets(teamId, undefined, signal),
          api.getTeam(teamId, signal),
        ]);
        return { sites, tickets, team };
      }),
    [teamId]
  );
  const state = useAtomValue(useMemo(() => loadable(resource), [resource])),
    refresh = useSetAtom(resource);
  const [recentSiteId, setRecentSiteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [extra, setExtra] = useAtom(useMemo(() => atom<SupportTicket[]>([]), []));
  const [cursor, setCursor] = useState<string | null | undefined>(),
    [busy, setBusy] = useState(false);
  const { run, error } = useAsyncError();
  const [statuses, setStatuses] = useAtom(
    useMemo(() => atom<Record<string, SupportTicket["status"]>>({}), [])
  );
  function reload() {
    setStatuses({});
    setExtra([]);
    setCursor(undefined);
    refresh();
  }
  if (state.state === "loading" || (state.state === "hasData" && !state.data))
    return <p role="status">Loading support inbox…</p>;
  if (state.state === "hasError")
    return (
      <>
        <ErrorBanner message={normalizeError(state.error).message} />
        <button className="btn-base btn-ghost mt-3" onClick={reload}>
          Retry
        </button>
      </>
    );
  const data = state.data;
  if (!data) return null;
  const rows = [...new Map([...data.tickets.tickets, ...extra].map((t) => [t.id, t])).values()].map(
    (t) => {
      const status = statuses[t.id];
      return status ? { ...t, status } : t;
    }
  );
  const visible = rows.filter(
    (t) =>
      (filter === "all" || t.status === filter) &&
      `${t.reference} ${t.subject} ${t.customer_name} ${t.customer_email}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  const next = cursor === undefined ? data.tickets.next_cursor : cursor;
  return (
    <main className="support mt-7">
      <div className="support-actions justify-between mb-6">
        <div>
          <p className="support-muted">{name}</p>
          <h1>Support inbox</h1>
          <p className="support-muted">Customer requests, with a clear path to resolution.</p>
        </div>
        <button type="button" className="btn-base btn-ghost" onClick={reload}>
          Refresh inbox
        </button>
      </div>
      <SupportSites
        teamId={teamId}
        data={data.sites}
        recentSiteId={recentSiteId}
        onSaved={(id) => {
          setRecentSiteId(id);
          reload();
        }}
      />
      {error && <ErrorBanner message={error.message} />}
      <div className="support-shell">
        <section className="support-card !p-0 overflow-hidden">
          <div className="p-4 space-y-3">
            <label className="support-field">
              Search loaded tickets
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Subject, customer or reference"
              />
            </label>
            <label className="support-field">
              Status
              <SupportSelect value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="waiting">Waiting for customer</option>
                <option value="resolved">Resolved</option>
              </SupportSelect>
            </label>
            <p className="support-muted">
              {visible.length} shown · {rows.length} loaded{next ? " · more available" : ""}
            </p>
          </div>
          <div className="support-list">
            {visible.map((ticket) => (
              <button
                type="button"
                className="support-row"
                data-selected={selected === ticket.id}
                key={ticket.id}
                onClick={() => setSelected(ticket.id)}
              >
                <div className="support-actions justify-between">
                  <span className="support-muted font-mono">{ticket.reference}</span>
                  <span className="support-chip">{ticket.status.replaceAll("_", " ")}</span>
                </div>
                <p className="font-medium my-2 break-words">{ticket.subject}</p>
                <p className="support-muted !my-0 truncate">
                  {ticket.customer_name} ·{" "}
                  {data.sites.sites.find((s) => s.id === ticket.site_id)?.name ?? "Website"}
                </p>
              </button>
            ))}
            {visible.length === 0 && (
              <p className="support-muted p-4">
                {rows.length
                  ? "No loaded tickets match these filters."
                  : "No tickets yet. Add your website and embed its form to start receiving requests."}
              </p>
            )}
          </div>
          {next && (
            <button
              type="button"
              className="btn-base btn-ghost m-4"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const page = await run(() => api.supportTickets(teamId, next));
                  if (page) {
                    setExtra((old) => [...old, ...page.tickets]);
                    setCursor(page.next_cursor);
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              Load more tickets
            </button>
          )}
        </section>
        {selected ? (
          <SupportTicketPanel
            key={selected}
            teamId={teamId}
            id={selected}
            members={data.team.members}
            sites={data.sites.sites}
            onChanged={reload}
            onStatusChanged={(status) => setStatuses((old) => ({ ...old, [selected]: status }))}
          />
        ) : (
          <section className="support-card">
            <h2>Select a ticket</h2>
            <p className="support-muted">
              Read the request, assign a teammate and reply. Internal notes stay visible only to
              your workspace.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
