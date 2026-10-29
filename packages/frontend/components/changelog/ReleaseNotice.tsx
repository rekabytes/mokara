"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState, type ReactNode } from "react";
import { normalizeError } from "@/lib/errors";
import { hasNewRelease } from "@/lib/changelog";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ReleaseNotes } from "./ReleaseNotes";
import { ReleaseToast } from "./ReleaseToast";
import {
  dismissedReleaseAtom,
  releaseOpenAtom,
  releaseResourceAtom,
  releaseViewAtom,
} from "./changelog-state";

export function ReleaseNotice({ userId }: { userId: string }) {
  const state = useAtomValue(releaseViewAtom);
  const refresh = useSetAtom(releaseResourceAtom);
  const [open, setOpen] = useAtom(releaseOpenAtom);
  const [dismissed, setDismissed] = useAtom(dismissedReleaseAtom);
  const [hidden, setHidden] = useState<string | null>(null);
  const { run, error } = useAsyncError();
  const latest = state.state === "hasData" ? state.data?.releases[0] : undefined;
  const version = latest?.version;
  const key = version ? `${userId}:${version}` : null;
  const dismiss = useCallback(() => {
    if (!key || !version) return;
    setHidden(key);
    void run(
      async () => {
        setDismissed((values) => ({ ...values, [userId]: version }));
      },
      {
        fallback:
          "Your browser couldn't save this preference. The notice may return after reloading.",
      }
    );
  }, [key, version, userId, run, setDismissed]);
  const openNotes = () => {
    dismiss();
    setOpen(true);
  };
  const showToast =
    latest && key && !open && hidden !== key && hasNewRelease(dismissed, userId, latest.version);
  return (
    <>
      {showToast && (
        <ReleaseToast key={key} release={latest} onOpen={openNotes} onDismiss={dismiss} />
      )}
      {open && (
        <ReleaseDialog onClose={() => setOpen(false)}>
          {state.state === "loading" ? (
            <p role="status" className="release-modal-state">
              Loading release notes…
            </p>
          ) : state.state === "hasError" ? (
            <div className="release-modal-state">
              <ErrorBanner
                message={normalizeError(state.error, "Couldn't load release notes.").message}
              />
              <button className="btn-base btn-ghost mt-3" onClick={() => refresh()}>
                Retry release notes
              </button>
            </div>
          ) : state.data?.releases.length ? (
            <ReleaseNotes releases={state.data.releases} />
          ) : (
            <p className="release-modal-state">No release notes yet.</p>
          )}
          <ErrorBanner message={error?.message} />
        </ReleaseDialog>
      )}
    </>
  );
}

function ReleaseDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  // Native dialog owns the top layer, background inertness and focus restoration.
  // A callback ref synchronizes that browser API for exactly this mounted dialog.
  const showDialog = useCallback((node: HTMLDialogElement | null) => {
    if (!node) return;
    const opener = document.activeElement;
    if (!node.open) node.showModal();
    return () => {
      node.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
      else document.getElementById("release-notes-trigger")?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={showDialog}
      className="release-modal"
      aria-labelledby="release-modal-title"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="release-modal-content">
        <header className="release-modal-header">
          <div>
            <p className="release-version">MOKARA UPDATES</p>
            <h2 id="release-modal-title">What&apos;s new</h2>
          </div>
          <button
            type="button"
            className="release-dismiss"
            aria-label="Close release notes"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function ReleaseNotesButton({ onOpen }: { onOpen: () => void }) {
  const [open, setOpen] = useAtom(releaseOpenAtom);
  return (
    <button
      type="button"
      id="release-notes-trigger"
      className="release-sidebar-button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => {
        setOpen(true);
        onOpen();
      }}
    >
      What&apos;s new
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}
