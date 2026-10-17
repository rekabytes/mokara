"use client";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { supportEmbed } from "@/lib/support-model";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { z } from "zod";
import type { supportSitesSchema, SupportSite } from "@/lib/support-types";
export function SupportSites({
  teamId,
  data,
  refresh,
}: {
  teamId: string;
  data: z.infer<typeof supportSitesSchema>;
  refresh: () => void;
}) {
  const { run, error } = useAsyncError();
  const [editing, setEditing] = useState<SupportSite | "new" | null>(null),
    [busy, setBusy] = useState(false),
    pending = useRef(false);
  const [copied, setCopied] = useState<string | null>(null);
  const current = editing && editing !== "new" ? editing : null;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await run(() =>
        api.saveSupportSite(
          teamId,
          {
            name: String(form.get("name")),
            origins: String(form.get("origins"))
              .split(/\n/)
              .map((s) => s.trim())
              .filter(Boolean),
            greeting: String(form.get("greeting")),
            accent: String(form.get("accent")),
            enabled: form.get("enabled") === "on",
          },
          current?.id
        )
      );
      if (result) {
        setEditing(null);
        refresh();
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="support-card mb-6">
      <div className="support-actions justify-between">
        <div>
          <h2>Your websites</h2>
          <p className="support-muted">
            {data.usage.sites} / {data.usage.site_limit ?? "Unlimited"} websites ·{" "}
            {data.usage.tickets} / {data.usage.ticket_limit ?? "Unlimited"} new tickets this month
          </p>
        </div>
        {data.owner && (
          <button
            className="btn-base btn-ghost"
            type="button"
            disabled={!data.configured || data.usage.site_limit === 0}
            onClick={() => setEditing("new")}
          >
            Add website
          </button>
        )}
      </div>
      <p className="support-muted">
        Shared across all workspaces owned by the account. Attachments use the same shared storage
        as mDrive. Monthly ticket usage resets on the first day of each month (UTC).
      </p>
      {!data.configured && (
        <ErrorBanner message="Support is not configured yet. Your operator needs to set the public URL and email-delivery settings." />
      )}
      {data.usage.site_limit === 0 && (
        <p className="support-muted">
          New ticket forms are available on Starter, Pro and Ultra. Existing tickets remain
          accessible.
        </p>
      )}
      {error && <ErrorBanner message={error.message} />}
      {data.sites.map((site) => (
        <details key={site.id} className="support-divider mt-4">
          <summary className="cursor-pointer">
            <span className="font-medium">{site.name}</span>{" "}
            <span className="support-chip ml-2">{site.enabled ? "Enabled" : "Paused"}</span>
          </summary>
          <p className="support-muted break-all">{site.origins.join(", ")}</p>
          <p className="support-muted">
            Paste this embed into your website’s Help page. Your website must allow frames from the
            form URL’s origin. No API key is needed.
          </p>
          <code className="support-code">
            {site.form_url
              ? supportEmbed(site.form_url)
              : "Public URL unavailable. Ask your operator to restore configuration."}
          </code>
          <div className="support-actions mt-3">
            <button
              type="button"
              className="btn-base btn-ghost"
              disabled={!site.form_url}
              onClick={async () => {
                const ok = await run(
                  async () => {
                    await navigator.clipboard.writeText(supportEmbed(site.form_url));
                    return true;
                  },
                  { fallback: "Could not copy the embed. Select and copy the snippet above." }
                );
                if (ok) setCopied(site.id);
              }}
            >
              {copied === site.id ? "Copied" : "Copy embed"}
            </button>
            <a className="btn-base btn-ghost" href={site.form_url} target="_blank" rel="noreferrer">
              Preview form
            </a>
            {data.owner && (
              <button className="btn-base btn-ghost" type="button" onClick={() => setEditing(site)}>
                Edit website
              </button>
            )}
          </div>
        </details>
      ))}
      {editing && (
        <form
          onSubmit={save}
          className="support-form support-divider mt-5"
          key={current?.id ?? "new"}
        >
          <h2>{current ? "Edit website" : "Add a website"}</h2>
          <div className="support-grid">
            <label className="support-field">
              Website name
              <input name="name" maxLength={100} required defaultValue={current?.name} />
            </label>
            <label className="support-field">
              Accent color
              <input name="accent" type="color" defaultValue={current?.accent ?? "#6366f1"} />
            </label>
          </div>
          <label className="support-field">
            Allowed website origins
            <textarea name="origins" required defaultValue={current?.origins.join("\n")} />
            <span className="support-muted">
              One exact HTTPS origin per line, including the scheme, without paths or wildcards.
              Localhost HTTP is allowed for development.
            </span>
          </label>
          <label className="support-field">
            Introduction
            <input
              name="greeting"
              maxLength={200}
              required
              defaultValue={current?.greeting ?? "Report an issue or send a request."}
            />
          </label>
          <label className="support-actions">
            <input name="enabled" type="checkbox" defaultChecked={current?.enabled ?? true} />{" "}
            Accept new tickets
          </label>
          <div className="support-actions">
            <button className="btn-base btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save website"}
            </button>
            <button
              type="button"
              className="btn-base btn-ghost"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
