"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type SessionInfo } from "@/lib/api";
import { manualError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { setSessionUser, signOutServer, useSession } from "@/lib/session";

// PRD-08: the settings page — account (display name), security (password) and
// devices (live session registry). One shared useAsyncError channel per page;
// its banner sits above the cards so a failure is never rendered twice.
// Display-name saves push straight into the session atom via setSessionUser,
// the same path login uses. Device revocations refresh the list; revoking the
// current device is a logout and returns to /login.

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

function timeAgo(iso: string): string {
  const diffS = Math.max(0, Date.now() / 1000 - new Date(iso).getTime() / 1000);
  if (diffS < 60) return "just now";
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

export default function SettingsPage() {
  const session = useSession();
  const { error, setError, clearError, run } = useAsyncError();
  const user = session.status === "authed" ? session.user : null;

  // --- account: display name ---
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const nameValue = nameDraft ?? user?.display_name ?? "";

  const onProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setProfileSaved(false);
    const trimmed = nameValue.trim();
    const updated = await run(
      () => api.updateMe({ display_name: trimmed.length > 0 ? trimmed : null }),
      {
        fallback: "Couldn't save your profile. Try again.",
      }
    );
    if (updated === null) return;
    setSessionUser(updated.user);
    setNameDraft(null);
    setProfileSaved(true);
  };

  // --- security: password ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  const onPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setError(manualError("The new passwords don't match."));
      return;
    }
    clearError();
    const ok = await run(
      () => api.changePassword({ current_password: currentPassword, new_password: newPassword }),
      { fallback: "Couldn't update the password. Try again." }
    );
    if (ok === null) return;
    setPasswordSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  // --- devices: live session registry ---
  const [devices, setDevices] = useState<SessionInfo[] | null>(null);

  const loadDevices = useCallback(async () => {
    const data = await run(() => api.listSessions(), { fallback: "Couldn't load your devices." });
    if (data === null) return;
    setDevices(data.sessions);
  }, [run]);

  // Initial device load — the documented allowed effect: a one-time read of
  // something outside React (the session registry over the API), re-run only
  // when the stable loadDevices identity changes.
  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const onRevokeDevice = async (id: string) => {
    const row = devices?.find((d) => d.id === id);
    const ok = await run(() => api.revokeSession(id), {
      fallback: "Couldn't sign out that device. Try again.",
    });
    if (ok === null) return;
    if (row?.current) {
      // Revoking yourself is a sign-out: clear the now-dead cookie and exit
      // hard to the front door — no client transition to race (2026-09-04).
      await signOutServer();
      window.location.assign("/");
      return;
    }
    void loadDevices();
  };

  const onRevokeAll = async () => {
    const ok = await run(() => api.revokeAllSessions(), {
      fallback: "Couldn't sign out your sessions. Try again.",
    });
    if (ok === null) return;
    // The endpoint already cleared the cookie — just leave, hard.
    window.location.assign("/");
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

      <div className="mx-auto w-full max-w-[34rem] py-8">
        <ErrorBanner className="mb-4" message={error?.message} />

        {/* --- Account --- */}
        <section className={CARD}>
          <span className="text-[0.8rem] font-semibold">Account</span>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.8rem] text-[var(--color-ink-muted)]">Username</span>
              <span className="truncate font-mono text-[0.82rem] font-semibold">
                @{user?.username ?? ""}
              </span>
            </div>
            <form onSubmit={onProfileSubmit} className="flex flex-col gap-[0.6rem]">
              <label className="flex flex-col gap-[0.35rem]">
                <span className="text-[0.78rem] font-semibold tracking-[0.01em] text-[var(--color-ink-muted)]">
                  Display name
                </span>
                <input
                  type="text"
                  maxLength={50}
                  placeholder="Shown next to your comments and activity"
                  value={nameValue}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="field"
                />
              </label>
              {profileSaved && (
                <p role="status" className="m-0 text-[0.8rem] text-[var(--color-ink-muted)]">
                  Profile saved.
                </p>
              )}
              <button
                type="submit"
                disabled={nameDraft === null}
                className="btn-base btn-ghost self-start border border-[var(--color-border-soft)] px-3.5 py-1.5 text-[0.8rem] disabled:cursor-default disabled:opacity-50"
              >
                Save
              </button>
            </form>
          </div>
        </section>

        {/* --- Security --- */}
        <section className={`${CARD} mt-4`}>
          <span className="text-[0.8rem] font-semibold">Password</span>
          <p className="mt-1 text-[0.8rem] text-[var(--color-ink-muted)]">
            Updating the password signs out every other signed-in device. This one stays signed in.
          </p>
          <form onSubmit={onPasswordSubmit} className="mt-4 flex flex-col gap-[0.85rem] text-left">
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
            {passwordSaved && (
              <p role="status" className="m-0 text-[0.8rem] text-[var(--color-ink-muted)]">
                Password updated — other devices were signed out.
              </p>
            )}
            <button type="submit" className="btn-base btn-primary mt-1 w-full">
              Update password
            </button>
          </form>
        </section>

        {/* --- Devices --- */}
        <section className={`${CARD} mt-4`}>
          <div className="flex items-baseline justify-between">
            <span className="text-[0.8rem] font-semibold">Devices</span>
            {devices !== null && (
              <span className="text-[0.78rem] text-[var(--color-ink-faint)]">
                {devices.length} active
              </span>
            )}
          </div>
          <p className="mt-1 text-[0.8rem] text-[var(--color-ink-muted)]">
            Mokara keeps you signed in for up to seven days per device. Signing a device out
            invalidates its session immediately — a copied cookie stops working too.
          </p>
          <ul className="mt-3 flex flex-col">
            {devices === null && (
              <li className="py-2 text-[0.8rem] text-[var(--color-ink-faint)]">Loading devices…</li>
            )}
            {devices !== null && devices.length === 0 && (
              <li className="py-2 text-[0.8rem] text-[var(--color-ink-faint)]">
                No signed-in devices yet — this page’s own request registers one in a moment.
              </li>
            )}
            {devices !== null &&
              devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 border-t border-[var(--color-border-soft)] py-2.5 first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[0.86rem] font-semibold">{d.device}</span>
                      {d.current && (
                        <span className="shrink-0 rounded-full border border-[var(--color-accent)] px-2 py-0.5 text-[0.66rem] font-semibold text-[var(--color-accent)]">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="text-[0.74rem] text-[var(--color-ink-faint)]">
                      Added {timeAgo(d.created_at)} · Active {timeAgo(d.last_seen_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevokeDevice(d.id)}
                    className="btn-base btn-ghost shrink-0 border border-[var(--color-border-soft)] px-3 py-1.5 text-[0.78rem]"
                  >
                    Log out
                  </button>
                </li>
              ))}
          </ul>
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
