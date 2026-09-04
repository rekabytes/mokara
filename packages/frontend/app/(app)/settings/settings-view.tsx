"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type SessionInfo } from "@/lib/api";
import { manualError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { setSessionUser, signOutServer, useSession } from "@/lib/session";
import { useContainers } from "@/lib/containers";

// PRD-08 v2 (bento, per the approved settings-redesign-mockup): a 12-column
// grid — identity (avatar, editable name, member-since, live stats) top-left,
// password as a tall right rail, the capped devices list under identity, and
// a slim honest danger strip at the bottom (deletion stays contact-only, as
// the privacy policy promises). Collapses to one column under 961px.
// One shared useAsyncError channel; its banner sits above the grid so a
// failure is never rendered twice.

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

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-2.5">
      <b className="block text-[1rem] font-extrabold">{value}</b>
      <span className="text-[0.7rem] text-[var(--color-ink-faint)]">{label}</span>
    </div>
  );
}

// Single-date display only — no day-index math anywhere near this.
function fmtMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeAgo(iso: string): string {
  const diffS = Math.max(0, Date.now() / 1000 - new Date(iso).getTime() / 1000);
  if (diffS < 60) return "just now";
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

export function SettingsView({ contactEmail }: { contactEmail: string | null }) {
  const session = useSession();
  const { containers } = useContainers();
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

  const TILE =
    "min-w-0 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-card)]";

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

      <ErrorBanner className="mb-3.5" message={error?.message} />

      {/* PRD-08 v2: centered bento grid — the top spacing lives here, not on
          the (usually absent) error banner above. */}
      <div className="mx-auto mt-6 grid w-full max-w-[980px] grid-cols-12 gap-3.5">
        {/* ======== Identity ======== */}
        <section className={`${TILE} col-span-12 min-[961px]:col-span-7`}>
          <div className="flex items-center gap-4">
            <div className="grid size-16 flex-none place-items-center rounded-full bg-[var(--color-accent)] text-[1.6rem] font-extrabold text-white shadow-[0_0_0_5px_var(--color-accent-soft)]">
              {(user?.display_name || user?.username || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <b className="truncate text-[1.15rem] font-extrabold tracking-[-0.01em]">
                  {user?.display_name || user?.username || ""}
                </b>
                <span className="flex-none rounded-[var(--radius-pill)] border border-[var(--color-border-soft)] bg-[rgba(148,163,184,0.1)] px-2 py-0.5 font-mono text-[0.72rem] text-[var(--color-ink-muted)]">
                  @{user?.username ?? ""}
                </span>
              </div>
              <div className="mt-1 text-[0.75rem] text-[var(--color-ink-faint)]">
                {user ? `Member since ${fmtMemberSince(user.created_at)}` : ""}
              </div>
            </div>
          </div>
          <form onSubmit={onProfileSubmit} className="mt-4 flex flex-wrap items-end gap-2.5">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[0.78rem] font-semibold text-[var(--color-ink-muted)]">
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
            <button
              type="submit"
              disabled={nameDraft === null}
              className="btn-base btn-ghost px-3.5 py-2 text-[0.8rem] disabled:cursor-default disabled:opacity-50"
            >
              Save
            </button>
          </form>
          {profileSaved && (
            <p role="status" className="mb-0 mt-2 text-[0.78rem] text-[var(--color-ink-muted)]">
              Profile saved.
            </p>
          )}
          <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-[var(--color-border-soft)] pt-3.5">
            <Stat value={devices?.length ?? "—"} label="signed-in devices" />
            <Stat value="7d" label="session length" />
            <Stat value={containers.length || "—"} label="containers" />
          </div>
        </section>

        {/* ======== Password (tall right rail) ======== */}
        <section
          className={`${TILE} col-span-12 flex flex-col min-[961px]:col-span-5 min-[961px]:row-span-2`}
        >
          <div>
            <div className="text-[0.8rem] font-semibold">Password</div>
            <p className="mb-0 mt-1 text-[0.78rem] text-[var(--color-ink-muted)]">
              Updating signs out every other signed-in device. This one stays signed in.
            </p>
          </div>
          <form onSubmit={onPasswordSubmit} className="mt-4 flex flex-col gap-3 text-left">
            <label className="flex flex-col gap-1">
              <span className="text-[0.78rem] font-semibold text-[var(--color-ink-muted)]">
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
            <label className="flex flex-col gap-1">
              <span className="text-[0.78rem] font-semibold text-[var(--color-ink-muted)]">
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
            <label className="flex flex-col gap-1">
              <span className="text-[0.78rem] font-semibold text-[var(--color-ink-muted)]">
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
              <p role="status" className="m-0 text-[0.78rem] text-[var(--color-ink-muted)]">
                Password updated — other devices were signed out.
              </p>
            )}
            <button type="submit" className="btn-base btn-primary mt-1 w-full">
              Update password
            </button>
            <span className="text-[0.7rem] text-[var(--color-ink-faint)]">Min 8 characters.</span>
          </form>
        </section>

        {/* ======== Devices ======== */}
        <section className={`${TILE} col-span-12 flex flex-col min-[961px]:col-span-7`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[0.8rem] font-semibold">
              Devices{" "}
              <span className="font-normal text-[var(--color-ink-faint)]">
                · {devices?.length ?? 0} active
              </span>
            </span>
            <span className="text-[0.72rem] text-[var(--color-ink-faint)]">
              signed in up to 7 days per device
            </span>
          </div>
          <ul className="m-0 mt-2 flex max-h-[252px] list-none flex-1 flex-col overflow-y-auto p-0">
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
                  className="flex items-center justify-between gap-3 border-t border-[var(--color-border-soft)] py-2 first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[0.86rem] font-semibold">{d.device}</span>
                      {d.current && (
                        <span className="flex-none rounded-[var(--radius-pill)] border border-[var(--color-accent)] px-2 py-0.5 text-[0.66rem] font-semibold text-[var(--color-accent)]">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="text-[0.72rem] text-[var(--color-ink-faint)]">
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
            className="btn-base btn-ghost mt-3 w-full border border-[var(--color-danger-border)] text-[var(--color-danger-ink)]"
          >
            Sign out everywhere
          </button>
        </section>

        {/* ======== Danger strip ======== */}
        <section className="col-span-12 flex min-w-0 flex-wrap items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--color-danger-border)] bg-[rgba(239,68,68,0.03)] p-4 shadow-[var(--shadow-card)]">
          <div className="min-w-0 flex-1">
            <div className="text-[0.8rem] font-semibold text-[var(--color-danger)]">
              Delete account
            </div>
            <p className="mb-0 mt-0.5 text-[0.78rem] text-[var(--color-ink-muted)]">
              Not self-service yet. The privacy policy promises deletion on request — email us and
              it is done, with your teams handed over first.
            </p>
          </div>
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}?subject=${encodeURIComponent("Delete account")}`}
              className="btn-base btn-ghost flex-none border border-[var(--color-danger-border)] px-3.5 py-2 text-[0.8rem] font-semibold text-[var(--color-danger)]"
            >
              Email us
            </a>
          )}
        </section>
      </div>
    </div>
  );
}
