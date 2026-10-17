"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithRefresh, loadable } from "jotai/utils";
import { api } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { normalizeError } from "@/lib/errors";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { z } from "zod";
import type { supportPublicDetailSchema } from "@/lib/support-types";

type Data = z.infer<typeof supportPublicDetailSchema>;
export function CustomerTicketAccess({ id }: { id: string }) {
  const [token, setToken] = useState<string | null>(null);
  // URL fragments are browser-owned and never reach the server. Synchronize
  // the capability when a private link opens or its fragment changes.
  useEffect(() => {
    const read = () => setToken(window.location.hash.slice(1));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  if (token === null) return <p role="status">Opening your ticket…</p>;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    return (
      <div className="support-card">
        <h1>Private ticket link required</h1>
        <p>Open the complete ticket link from your confirmation email.</p>
      </div>
    );
  return <CustomerTicket key={`${id}:${token}`} id={id} token={token} />;
}
function CustomerTicket({ id, token }: { id: string; token: string }) {
  const resource = useMemo(
    () =>
      atomWithRefresh(async (_get, { signal }) => {
        if (typeof window === "undefined") return null;
        return api.publicSupportTicket(id, token, undefined, signal);
      }),
    [id, token]
  );
  const state = useAtomValue(useMemo(() => loadable(resource), [resource])),
    refresh = useSetAtom(resource);
  const { run, error, clearError } = useAsyncError();
  const [extra, setExtra] = useAtom(useMemo(() => atom<Data["messages"]>([]), []));
  const [cursor, setCursor] = useState<string | null | undefined>();
  const [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    pending = useRef(false),
    request = useRef<string | null>(null);
  async function reply(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    clearError();
    request.current ??= crypto.randomUUID();
    try {
      const result = await run(() =>
        api.publicSupportReply(id, token, { request_id: request.current ?? "", body })
      );
      if (result) {
        setBody("");
        request.current = null;
        setExtra([]);
        setCursor(undefined);
        refresh();
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (state.state === "loading" || (state.state === "hasData" && !state.data))
    return <p role="status">Loading ticket…</p>;
  if (state.state === "hasError")
    return (
      <>
        <ErrorBanner message={normalizeError(state.error).message} />
        <button className="btn-base btn-ghost mt-4" onClick={() => refresh()}>
          Retry
        </button>
      </>
    );
  const data = state.data;
  if (!data) return null;
  const next = cursor === undefined ? data.next_cursor : cursor;
  const messages = [...new Map([...data.messages, ...extra].map((m) => [m.id, m])).values()];
  return (
    <section className="support-card">
      <p className="support-muted">
        {data.site_name} · {data.ticket.reference}
      </p>
      <h1>{data.ticket.subject}</h1>
      <span className="support-chip mt-3">{data.ticket.status.replaceAll("_", " ")}</span>
      <p className="whitespace-pre-wrap break-words">{data.ticket.details}</p>
      {data.attachments.length > 0 && (
        <div className="support-actions mb-6">
          {data.attachments.map((file) => (
            <button
              type="button"
              className="btn-base btn-ghost max-w-full"
              key={file.id}
              onClick={async () => {
                const blob = await run(() => api.downloadSupportFile(id, token, file.id));
                if (!blob) return;
                const url = URL.createObjectURL(blob),
                  anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = file.name;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              <span className="truncate">{file.name}</span>
            </button>
          ))}
        </div>
      )}
      <h2 className="support-divider">Ticket updates</h2>
      {messages.length === 0 && (
        <p className="support-muted">Your request has been received. Replies will appear here.</p>
      )}
      {messages.map((m) => (
        <article className="support-message" key={m.id}>
          <div className="support-actions justify-between">
            <span className="font-medium">{m.author}</span>
            <time className="support-muted" dateTime={m.created_at}>
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
              const page = await run(() => api.publicSupportTicket(id, token, next));
              if (page) {
                setExtra((old) => [...old, ...page.messages]);
                setCursor(page.next_cursor);
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          Load more updates
        </button>
      )}
      {error && <ErrorBanner message={error.message} />}
      <form onSubmit={reply} className="support-form mt-6">
        <label className="support-field">
          Add a reply
          <textarea
            value={body}
            required
            maxLength={10000}
            disabled={busy}
            onChange={(e) => {
              setBody(e.target.value);
              request.current = null;
            }}
            placeholder="Add more details or let us know if the issue is resolved."
          />
        </label>
        <div className="support-actions justify-between">
          <span className="support-muted">Keep your ticket link private.</span>
          <button type="submit" className="btn-base btn-primary" disabled={busy}>
            {busy ? "Sending…" : "Send reply"}
          </button>
        </div>
      </form>
      <p className="support-muted support-divider mt-6">Powered by Mokara</p>
    </section>
  );
}
