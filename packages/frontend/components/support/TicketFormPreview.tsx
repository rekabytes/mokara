import type { CSSProperties } from "react";
import { supportButtonStyle } from "@/lib/support-model";
import type { SupportSiteDraft } from "@/lib/support-types";
import { TicketContactFields, TicketRequestFields } from "./ticket-fields";

export function TicketFormPreview({
  site,
}: {
  site: Pick<SupportSiteDraft, "name" | "accent" | "button_text_color" | "greeting" | "enabled">;
}) {
  const theme: CSSProperties & { "--color-accent": string } = { "--color-accent": site.accent };
  return (
    <figure className="support-site-preview">
      <figcaption>
        <div className="support-actions justify-between">
          <h3>Customer form preview</h3>
          <span className="support-chip">Preview</span>
        </div>
        <p className="support-muted">Updates as you edit. No ticket will be sent.</p>
      </figcaption>
      <section
        className="support-preview-surface"
        style={theme}
        aria-label="Sample customer ticket form"
      >
        <p className="support-preview-name">{site.name.trim() || "Your business"}</p>
        <h3>Submit a support ticket</h3>
        <p className="support-muted support-preview-intro">
          {site.greeting.trim() || "Your introduction will appear here."}
        </p>
        {!site.enabled && (
          <p className="support-preview-paused">New tickets will be paused after saving.</p>
        )}
        <div className="support-form" inert>
          <TicketRequestFields />
          <div className="support-drop support-preview-attachment">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5L13 2a4 4 0 0 1 5.7 5.7l-8.9 8.9a2 2 0 1 1-2.8-2.8l8.5-8.5" />
            </svg>
            <div>
              <span>Attach screenshots or files</span>
              <p className="support-muted">Optional · up to 3 images or PDFs · 3 MB each</p>
            </div>
          </div>
          <TicketContactFields />
          <div className="support-preview-footer">
            <button
              type="button"
              className="btn-base btn-primary"
              aria-disabled="true"
              style={supportButtonStyle(site.accent, site.button_text_color)}
            >
              Submit ticket
            </button>
            <span className="support-muted">Powered by Mokara</span>
          </div>
        </div>
      </section>
      <p className="support-muted support-preview-note">
        After saving, copy the embed into your Help page and send a test ticket.
      </p>
    </figure>
  );
}
