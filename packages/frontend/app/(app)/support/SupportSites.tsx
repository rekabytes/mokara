"use client";
import { useState } from "react";
import { SupportChevron } from "@/components/support/SupportChevron";
import Link from "next/link";
import { SupportSiteEditor } from "./SupportSiteEditor";
import { SupportSetupSteps } from "./SupportSetupSteps";
import { supportEmbed } from "@/lib/support-model";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { z } from "zod";
import type { supportSitesSchema, SupportSite } from "@/lib/support-types";
export function SupportSites({
  teamId,
  data,
  onSaved,
  recentSiteId,
}: {
  teamId: string;
  data: z.infer<typeof supportSitesSchema>;
  onSaved: (id: string | null) => void;
  recentSiteId: string | null;
}) {
  const { run, error } = useAsyncError();
  const [editing, setEditing] = useState<SupportSite | "new" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const current = editing && editing !== "new" ? editing : null;
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
      {!editing && (
        <div className="support-setup-overview support-divider mt-5">
          <div className="support-actions justify-between">
            <h3>
              {recentSiteId ? "Continue your website setup" : "Connect your website in three steps"}
            </h3>
            <Link href="/docs/support#setup" className="support-guide-link">
              Setup guide <span aria-hidden="true">→</span>
            </Link>
          </div>
          <SupportSetupSteps current={copied ? 3 : recentSiteId ? 2 : 1} />
          <p className="support-muted">
            {copied
              ? "Add the copied embed to your website’s Help page, then send a test ticket. Copying alone does not install the form."
              : recentSiteId
                ? "Your website is saved. Copy its embed below to add the form to your Help page."
                : "Add your website’s name and exact origins, customize the customer form, then copy the embed into your Help page."}
          </p>
        </div>
      )}
      {data.sites.map((site) => (
        <details
          key={site.id}
          className="support-divider mt-4"
          open={!editing && site.id === recentSiteId}
        >
          <summary className="support-site-summary">
            <SupportChevron className="support-disclosure-chevron" />
            <span className="font-medium">{site.name}</span>{" "}
            <span className="support-chip ml-2">{site.enabled ? "Enabled" : "Paused"}</span>
          </summary>
          <p className="support-muted break-all">{site.origins.join(", ")}</p>
          <h3 className="mt-4">2. Embed your form</h3>
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
          <div className="support-install-note">
            <h3>3. Send a test ticket</h3>
            <p className="support-muted">
              Open your Help page on an allowed website and submit a request. Confirm it appears in
              this workspace’s inbox and that the confirmation email arrives.
            </p>
            <Link href="/docs/support#test" className="support-guide-link">
              Testing and troubleshooting <span aria-hidden="true">→</span>
            </Link>
          </div>
        </details>
      ))}
      {editing && (
        <SupportSiteEditor
          key={current?.id ?? "new"}
          teamId={teamId}
          site={current}
          onCancel={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            onSaved(id);
          }}
        />
      )}
    </section>
  );
}
