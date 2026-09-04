"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { manualError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { forgetSessionUser } from "@/lib/session";

// PRD-08: two abilities on one page — change password (signs out every other
// device; this one stays signed in) and sign out everywhere (invalidates all
// sessions, including this one). Failures flow through useAsyncError →
// ErrorBanner; the confirm-match check is client-side only (manualError, the
// documented client-validation shape).

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5l2.7 5.5 6 .9-4.4 4.2 1.1 6L12 17.3 6.6 20l1.1-6L3.3 9.9l6-.9L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 16V11a6 6 0 1112 0v5l1.5 2H4.5L6 16z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const CARD =
  "rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]";

export default function SettingsPage() {
  const { error, setError, run } = useAsyncError();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saved, setSaved] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError(manualError("The new passwords don't match."));
      return;
    }
    setError(null);
    const ok = await run(
      () => api.changePassword({ current_password: currentPassword, new_password: newPassword }),
      { fallback: "Couldn't update the password. Try again." }
    );
    if (ok === null) return;
    setSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const onRevokeAll = async () => {
    const ok = await run(() => api.revokeAllSessions(), {
      fallback: "Couldn't sign out your sessions. Try again.",
    });
    if (ok === null) return;
    forgetSessionUser();
    router.replace("/login");
  };

  return (
    <div>
      {/* Top bar: breadcrumb + actions — same as the Tasks/Team pages */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] py-1">
        <div className="flex items-center gap-[0.4rem] text-[0.92rem] font-semibold">
          <span className="text-[var(--color-ink-muted)]">Mokara</span>
          <span className="text-[var(--color-ink-faint)]">›</span>
          <span>Settings</span>
          <button
            type="button"
            aria-label="Star"
            className="ml-1 grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-muted)]"
          >
            <StarIcon />
          </button>
        </div>
        <button
          type="button"
          aria-label="Notifications"
          className="grid size-8 cursor-pointer place-items-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        >
          <BellIcon />
        </button>
      </div>

      <div className="mx-auto w-full max-w-[30rem] py-10">
        <section className={CARD}>
          <span className="text-[0.8rem] font-semibold">Password</span>
          <p className="mt-1 text-[0.8rem] text-[var(--color-ink-muted)]">
            Updating the password signs out every other signed-in device. This one stays signed in.
          </p>
          <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-[0.85rem] text-left">
            <label className="flex flex-col gap-[0.35rem]">
              <span className="text-[0.78rem] font-semibold tracking-[0.01em] text-[var(--color-ink-muted)]">
                Current password
              </span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="field"
              />
            </label>
            <label className="flex flex-col gap-[0.35rem]">
              <span className="text-[0.78rem] font-semibold tracking-[0.01em] text-[var(--color-ink-muted)]">
                New password
              </span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="field"
              />
            </label>
            <label className="flex flex-col gap-[0.35rem]">
              <span className="text-[0.78rem] font-semibold tracking-[0.01em] text-[var(--color-ink-muted)]">
                Confirm new password
              </span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="field"
              />
            </label>
            <ErrorBanner className="mt-1" message={error?.message} />
            {saved && (
              <p role="status" className="m-0 text-[0.82rem] text-[var(--color-ink-muted)]">
                Password updated — other devices were signed out.
              </p>
            )}
            <button type="submit" className="btn-base btn-primary mt-1 w-full">
              Update password
            </button>
          </form>
        </section>

        <section className={`${CARD} mt-4`}>
          <span className="text-[0.8rem] font-semibold">Signed-in devices</span>
          <p className="mt-1 text-[0.8rem] text-[var(--color-ink-muted)]">
            Mokara keeps you signed in for up to seven days per device. This invalidates every
            session everywhere — including this one, which returns you to the login screen.
          </p>
          <button
            type="button"
            onClick={onRevokeAll}
            className="btn-base btn-ghost mt-4 w-full border border-[var(--color-danger-border)] text-[var(--color-danger-ink)]"
          >
            Sign out everywhere
          </button>
        </section>
      </div>
    </div>
  );
}
