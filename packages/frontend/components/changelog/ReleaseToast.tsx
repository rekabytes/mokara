"use client";

import { useEffect } from "react";
import type { Release } from "@/lib/changelog";
import { scheduleNoticeDismissal } from "./release-notice-timing";

export function ReleaseToast({
  release,
  onOpen,
  onDismiss,
}: {
  release: Release;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  // The requested 30-second timeout synchronizes with the browser clock. It
  // controls notice lifetime, not animation; unmounting cancels the timer.
  useEffect(() => scheduleNoticeDismissal(onDismiss), [onDismiss]);
  return (
    <aside className="release-toast" aria-label="New Mokara update">
      <button type="button" className="release-toast-open" aria-haspopup="dialog" onClick={onOpen}>
        <span className="release-version">What&apos;s new · v{release.version}</span>
        <span className="release-toast-title">{release.title}</span>
        <span className="release-toast-link">
          Read the update
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
        </span>
      </button>
      <button
        type="button"
        className="release-dismiss release-toast-close"
        aria-label="Dismiss release notice"
        onClick={onDismiss}
      >
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
      </button>
    </aside>
  );
}
