"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { supportButtonStyle, supportContrastRatio } from "@/lib/support-model";
import { SupportColorPicker } from "./SupportColorPicker";
import { api } from "@/lib/api";
import { manualError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { TicketFormPreview } from "@/components/support/TicketFormPreview";
import type { SupportSite } from "@/lib/support-types";
import {
  DEFAULT_SUPPORT_ACCENT,
  initialSupportDraft,
  SUPPORT_ACCENT_PRESETS,
  SUPPORT_TEXT_PRESETS,
  supportHex,
  supportOriginHint,
  supportSitePayload,
} from "./site-setup-model";
import { SupportSetupSteps } from "./SupportSetupSteps";

export function SupportSiteEditor({
  teamId,
  site,
  onSaved,
  onCancel,
}: {
  teamId: string;
  site: SupportSite | null;
  onSaved: (id: string | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => initialSupportDraft(site));
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const id = useId();
  const { run, error, setError, clearError } = useAsyncError();
  const accent = supportHex(draft.accent);
  const previewAccent = accent ?? site?.accent ?? DEFAULT_SUPPORT_ACCENT;
  const buttonText = draft.buttonTextColor === null ? null : supportHex(draft.buttonTextColor);
  const buttonStyle = supportButtonStyle(previewAccent, buttonText);
  const contrast = supportContrastRatio(buttonStyle.backgroundColor, buttonStyle.color);
  const originHint = supportOriginHint(draft.originsText);
  const pickAccent = (value: string) =>
    setDraft((old) => ({ ...old, accent: value.toUpperCase() }));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    clearError();
    if (!accent) {
      setError(manualError("Enter a six-digit hex color beginning with #."));
      return;
    }
    if (draft.buttonTextColor !== null && !buttonText) {
      setError(
        manualError("Enter a six-digit button text color beginning with #, or choose Automatic.")
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const result = await run(() =>
        api.saveSupportSite(teamId, supportSitePayload(draft, accent), site?.id)
      );
      if (result) onSaved("site" in result ? result.site.id : (site?.id ?? null));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="support-site-setup support-divider mt-5">
      <div className="support-setup-heading">
        <div>
          <h2>{site ? "Edit your website" : "Add your website"}</h2>
          <p className="support-muted">Set up a support form for your customers.</p>
        </div>
        <SupportSetupSteps current={1} />
      </div>
      <div className="support-setup-layout">
        <form
          onSubmit={save}
          className="support-site-editor"
          aria-label={site ? "Edit website" : "Add website"}
        >
          <fieldset disabled={busy} className="support-editor-fields">
            <label className="support-field">
              Website name
              <input
                name="name"
                maxLength={100}
                required
                value={draft.name}
                placeholder="Your business"
                onChange={(e) => setDraft((old) => ({ ...old, name: e.target.value }))}
              />
              <span className="support-muted">
                Shown on your form and in the email sender name.
              </span>
            </label>
            <div>
              <div className="support-brand-colors">
                <SupportColorPicker
                  id={`${id}-hex`}
                  label="Brand accent"
                  name="accent"
                  value={draft.accent}
                  swatch={previewAccent}
                  selected={accent}
                  hint="Used on your customer form’s buttons and highlights."
                  presets={SUPPORT_ACCENT_PRESETS}
                  resetLabel="Reset"
                  onChange={pickAccent}
                  onReset={() => pickAccent(DEFAULT_SUPPORT_ACCENT)}
                />
                <SupportColorPicker
                  id={`${id}-text`}
                  label="Button text"
                  name="button_text_color"
                  value={draft.buttonTextColor ?? buttonStyle.color.toUpperCase()}
                  swatch={buttonText ?? buttonStyle.color}
                  selected={draft.buttonTextColor === null ? null : buttonText}
                  hint={
                    draft.buttonTextColor === null
                      ? "Automatic white text with a contrast-aware background."
                      : "Custom text color. Choose Automatic to restore contrast-aware colors."
                  }
                  presets={SUPPORT_TEXT_PRESETS}
                  resetLabel="Automatic"
                  onChange={(value) =>
                    setDraft((old) => ({ ...old, buttonTextColor: value.toUpperCase() }))
                  }
                  onReset={() => setDraft((old) => ({ ...old, buttonTextColor: null }))}
                />
              </div>
              <p className="support-color-contrast" role="status">
                Contrast {contrast.toFixed(2)}:1
                {contrast < 4.5
                  ? " · Low contrast. Aim for at least 4.5:1 for readable text."
                  : " · Readable button text"}
              </p>
            </div>
            <label className="support-field">
              Allowed website origins
              <textarea
                name="origins"
                value={draft.originsText}
                required
                rows={3}
                placeholder="Paste your website’s origin, one per line"
                onChange={(e) => setDraft((old) => ({ ...old, originsText: e.target.value }))}
              />
              <span className="support-muted">
                One exact origin per line. Include HTTPS and omit paths, trailing slashes and
                wildcards. Add the www version separately if you use it. Localhost HTTP is allowed
                for development.
              </span>
              {originHint && (
                <span className="support-origin-example">
                  Origin from your entry: <code>{originHint}</code>
                </span>
              )}
            </label>
            <label className="support-field">
              Introduction
              <textarea
                name="greeting"
                maxLength={200}
                rows={2}
                required
                value={draft.greeting}
                onChange={(e) => setDraft((old) => ({ ...old, greeting: e.target.value }))}
              />
              <span className="support-muted">
                A short message your customers see before completing the form.
              </span>
            </label>
            <label className="support-accept-tickets">
              <input
                name="enabled"
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft((old) => ({ ...old, enabled: e.target.checked }))}
              />
              <span>
                Accept new tickets
                <span className="support-muted">Turn off to pause new requests.</span>
              </span>
            </label>
            <ErrorBanner message={error?.message} />
            <div className="support-actions">
              <button type="submit" className="btn-base btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save website"}
              </button>
              <button
                type="button"
                className="btn-base btn-ghost"
                disabled={busy}
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
            <Link
              href="/docs/support#setup"
              target="_blank"
              rel="noreferrer"
              className="support-guide-link"
            >
              Read the setup guide <span aria-hidden="true">→</span>
            </Link>
          </fieldset>
        </form>
        <TicketFormPreview
          site={{
            name: draft.name,
            accent: previewAccent,
            button_text_color: buttonText,
            greeting: draft.greeting,
            enabled: draft.enabled,
          }}
        />
      </div>
    </div>
  );
}
