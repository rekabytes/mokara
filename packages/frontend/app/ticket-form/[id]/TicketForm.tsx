"use client";
import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { SupportConfig } from "@/lib/support-types";
import { supportButtonStyle } from "@/lib/support-model";
import { useAsyncError } from "@/hooks/useAsyncError";
import { manualError } from "@/lib/errors";
import { ErrorBanner } from "@/components/ErrorBanner";
import { TicketRequestFields, TicketContactFields } from "@/components/support/ticket-fields";
import { SupportVerification } from "@/components/support/SupportVerification";

type PendingFile = { file: File; id: string; done: boolean };
export function TicketForm({ config }: { config: SupportConfig }) {
  const { run, error, setError, clearError } = useAsyncError();
  const [files, setFiles] = useState<PendingFile[]>([]),
    [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string>(),
    [verification, setVerification] = useState(0);
  const [created, setCreated] = useState<{
    id: string;
    reference: string;
    url: string;
    email: string;
  } | null>(null);
  const requestId = useRef<string | null>(null),
    pending = useRef(false);
  const theme: CSSProperties & { "--color-accent": string } = {
    "--color-accent": config.site.accent,
  };
  const addFiles = (selected: File[]) => {
    clearError();
    if (
      files.length + selected.length > config.max_files ||
      selected.some(
        (f) =>
          f.size > config.max_file_bytes ||
          !["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"].includes(
            f.type
          )
      )
    ) {
      setError(manualError("Choose up to 3 images or PDFs, no larger than 3 MB each."));
      return;
    }
    setFiles((old) => [
      ...old,
      ...selected.map((file) => ({ file, id: crypto.randomUUID(), done: false })),
    ]);
  };
  async function uploadRemaining(ticket: { id: string; url: string }) {
    const capability = new URL(ticket.url).hash.slice(1);
    for (const item of files.filter((f) => !f.done)) {
      const uploaded = await run(() =>
        api.uploadSupportFile(ticket.id, capability, item.id, item.file)
      );
      if (!uploaded) return false;
      setFiles((old) => old.map((f) => (f.id === item.id ? { ...f, done: true } : f)));
    }
    return true;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    clearError();
    const data = new FormData(event.currentTarget),
      field = (name: string) => String(data.get(name) ?? "");
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await run(() =>
        api.submitSupportTicket(config.site.id, {
          request_id: requestId.current ?? "",
          subject: field("subject"),
          details: field("details"),
          request_type: field("request_type"),
          area: field("area"),
          customer_name: field("customer_name"),
          customer_email: field("customer_email"),
          website: field("website"),
          turnstile_token: token,
        })
      );
      if (!result) {
        setToken(undefined);
        setVerification((v) => v + 1);
        return;
      }
      const ticket = {
        id: result.ticket.id,
        reference: result.ticket.reference,
        url: result.ticket_url,
        email: result.ticket.customer_email,
      };
      setCreated(ticket);
      await uploadRemaining(ticket);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const remaining = files.filter((f) => !f.done);
  if (created)
    return (
      <section className="support-card" style={theme} aria-live="polite">
        <div className="support-check">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
        </div>
        <h1>Ticket submitted</h1>
        <p className="support-muted">Ticket reference</p>
        <p className="text-xl font-mono break-all">{created.reference}</p>
        <p>
          Your confirmation email is queued for{" "}
          <strong className="font-medium break-all">{created.email}</strong>.
        </p>
        <p className="support-muted">
          You can follow progress and reply using your private ticket link.
        </p>
        {error && <ErrorBanner message={error.message} />}{" "}
        {remaining.length > 0 && (
          <div className="support-drop">
            <p>
              {remaining.length} attachment{remaining.length === 1 ? "" : "s"} still need uploading.
              Your ticket has already been saved.
            </p>
            <button
              type="button"
              className="btn-base btn-ghost"
              disabled={busy}
              onClick={async () => {
                if (pending.current) return;
                pending.current = true;
                setBusy(true);
                clearError();
                try {
                  await uploadRemaining(created);
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            >
              Retry attachments
            </button>
          </div>
        )}
        <div className="support-actions mt-6">
          <a
            className="btn-base btn-primary"
            style={supportButtonStyle(config.site.accent, config.site.button_text_color)}
            href={created.url}
            target="_blank"
            rel="noreferrer"
          >
            View ticket
          </a>
          <button
            className="btn-base btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setCreated(null);
              setFiles([]);
              requestId.current = null;
              setToken(undefined);
              setVerification((v) => v + 1);
              clearError();
            }}
          >
            Submit another ticket
          </button>
        </div>
        <p className="support-muted support-divider mt-6">Powered by Mokara</p>
      </section>
    );
  return (
    <section className="support-card" style={theme}>
      <p className="support-muted mb-3">{config.site.name}</p>
      <h1>Submit a support ticket</h1>
      <p className="support-muted mb-6">{config.site.greeting}</p>
      {!config.available && (
        <ErrorBanner message="This business cannot receive tickets right now. Please contact them directly." />
      )}
      {error && <ErrorBanner message={error.message} />}
      <form
        className="support-form"
        onSubmit={submit}
        onChange={() => {
          requestId.current = null;
        }}
      >
        <fieldset
          disabled={busy || !config.available}
          className="support-form border-0 min-w-0 p-0 m-0"
        >
          <TicketRequestFields />
          <div
            className="support-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <label className="support-field">
              Attach screenshots or files
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                onChange={(e) => {
                  addFiles(Array.from(e.currentTarget.files ?? []));
                  e.currentTarget.value = "";
                }}
              />
              <span className="support-muted">Optional · up to 3 images or PDFs · 3 MB each</span>
            </label>
            <div className="support-actions mt-3">
              {files.map((f) => (
                <span className="support-chip max-w-full" key={f.id}>
                  <span className="truncate">{f.file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.file.name}`}
                    onClick={() => setFiles((old) => old.filter((item) => item.id !== f.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <TicketContactFields />
          <label className="support-honeypot" aria-hidden="true">
            Leave empty
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          {config.protection.required && (
            <SupportVerification
              key={verification}
              siteKey={config.protection.site_key}
              onToken={setToken}
            />
          )}
          <div className="support-actions support-divider justify-between">
            <span className="support-muted">Powered by Mokara</span>
            <button
              type="submit"
              className="btn-base btn-primary"
              style={supportButtonStyle(config.site.accent, config.site.button_text_color)}
              disabled={busy || (config.protection.required && !token)}
            >
              {busy ? "Submitting…" : "Submit ticket"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
