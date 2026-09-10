"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { api, type BillingInfo, type SessionInfo } from "@/lib/api";
import { manualError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageHeader } from "@/components/PageHeader";
import { BillingTile } from "./BillingTile";
import { setSessionUser, signOutServer, useSession } from "@/lib/session";
import { useContainers } from "@/lib/containers";
import { tileIn, tileStagger } from "@/lib/motion";

import { fmtMemberSince, timeAgo } from "./billing-copy";
import {
  AlertIcon,
  DevicesIcon,
  LockIcon,
  Stat,
  TILE,
  TileHeader,
  UserIcon,
} from "./settings-chrome";

// PRD-08 v3 — the premium pass on the bento: every tile gets a quiet header
// (hand-drawn icon chip + title + caption) and a one-shot entrance stagger.
// The grid: identity | password up top, the Plan & billing hero full-width
// next (the page's one accent moment — current plan + live limits on the
// left, and when Free on a billing-enabled instance, the upgrade pitch on
// the right, rendered entirely from the tier ladder GET /me/billing
// returns), then devices | danger strip. Collapses to one column under
// 961px. Behavior is identical to PRD-08 v2; only presentation changed.

// --- hand-drawn section icons (local per-file, like everywhere else) ---

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

  // --- plan & billing (PRD-11 Phase 2) ---
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);

  const loadBilling = useCallback(async () => {
    // Sync BEFORE reading: the return trip from Stripe-hosted checkout lands
    // here, and in local dev the webhook cannot reach localhost — the server
    // applies the same mapping either way. Void endpoint → ignore the value.
    await run(() => api.syncBilling(), { fallback: "Couldn't reach billing." });
    const data = await run(() => api.getBilling(), { fallback: "Couldn't load your plan." });
    if (data) setBilling(data);
  }, [run]);

  // Initial billing load — a one-time read of server state outside React
  // (same documented pattern as the devices list above).
  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  // Checkout is workspace-scoped (leader-only), but the PLAN is the account's:
  // any container the caller leads works — the personal workspace always
  // qualifies. Stripe's page is outside the app, so the redirect is a hard
  // navigation, not a router push.
  const onUpgrade = async () => {
    const team = containers.find((c) => c.role === "owner") ?? containers[0];
    if (!team) return;
    setBillingBusy(true);
    const res = await run(() => api.startCheckout(team.id), {
      fallback: "Couldn't start checkout. Try again.",
    });
    setBillingBusy(false);
    if (!res) return;
    window.location.assign(res.url);
  };

  const onManage = async () => {
    setBillingBusy(true);
    const res = await run(() => api.billingPortal(), {
      fallback: "Couldn't open the billing portal.",
    });
    setBillingBusy(false);
    if (!res) return;
    window.location.assign(res.url);
  };

  const showPitch = billing !== null && billing.plan === "free" && billing.checkout_configured;

  return (
    <div>
      {/* Top bar: breadcrumb + actions — same as the Tasks/Team pages */}
      <PageHeader>Settings</PageHeader>

      <ErrorBanner className="mb-3.5" message={error?.message} />

      {/* PRD-08 v3: centered bento grid with a calm entrance stagger. The top
          spacing lives here, not on the (usually absent) error banner above. */}
      <motion.div
        variants={tileStagger}
        initial="hidden"
        animate="show"
        className="mx-auto mt-6 grid w-full max-w-[980px] grid-cols-12 gap-3.5"
      >
        {/* ======== Identity ======== */}
        <motion.section variants={tileIn} className={`${TILE} col-span-12 min-[961px]:col-span-7`}>
          <TileHeader
            icon={<UserIcon />}
            title="Profile"
            caption="How teammates see you across the workspace"
          />
          <div className="mt-4 flex items-center gap-4">
            <div className="grid size-14 flex-none place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-progress),var(--color-accent))] text-[1.4rem] font-extrabold text-white shadow-[0_0_0_5px_var(--color-accent-soft)]">
              {(user?.display_name || user?.username || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <b className="truncate text-[1.2rem] font-extrabold tracking-[-0.01em]">
                  {user?.display_name || user?.username || ""}
                </b>
                <span className="flex-none rounded-[var(--radius-pill)] border border-[var(--color-border-soft)] bg-[rgba(148,163,184,0.1)] px-2 py-0.5 font-mono text-[0.76rem] text-[var(--color-ink-muted)]">
                  @{user?.username ?? ""}
                </span>
              </div>
              <div className="mt-1 text-[0.8rem] text-[var(--color-ink-faint)]">
                {user ? `Member since ${fmtMemberSince(user.created_at)}` : ""}
              </div>
            </div>
          </div>
          <form onSubmit={onProfileSubmit} className="mt-4 flex flex-wrap items-end gap-2.5">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[0.84rem] font-semibold text-[var(--color-ink-muted)]">
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
              className="btn-base btn-ghost px-3.5 py-2 text-[0.85rem] disabled:cursor-default disabled:opacity-50"
            >
              Save
            </button>
          </form>
          {profileSaved && (
            <p role="status" className="mb-0 mt-2 text-[0.84rem] text-[var(--color-ink-muted)]">
              Profile saved.
            </p>
          )}
          <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-[var(--color-border-soft)] pt-3.5">
            <Stat value={devices?.length ?? "—"} label="signed-in devices" />
            <Stat value="7d" label="session length" />
            <Stat value={containers.length || "—"} label="containers" />
          </div>
        </motion.section>

        {/* ======== Password ======== */}
        <motion.section variants={tileIn} className={`${TILE} col-span-12 min-[961px]:col-span-5`}>
          <TileHeader
            icon={<LockIcon />}
            title="Password"
            caption="Changing it signs out every other device"
          />
          <form onSubmit={onPasswordSubmit} className="mt-4 flex flex-col gap-3 text-left">
            <label className="flex flex-col gap-1">
              <span className="text-[0.84rem] font-semibold text-[var(--color-ink-muted)]">
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
              <span className="text-[0.84rem] font-semibold text-[var(--color-ink-muted)]">
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
              <span className="text-[0.84rem] font-semibold text-[var(--color-ink-muted)]">
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
              <p role="status" className="m-0 text-[0.84rem] text-[var(--color-ink-muted)]">
                Password updated — other devices were signed out.
              </p>
            )}
            <button type="submit" className="btn-base btn-primary mt-1 w-full">
              Update password
            </button>
          </form>
        </motion.section>

        {/* ======== Plan & billing — the hero ======== */}
        <BillingTile
          billing={billing}
          showPitch={showPitch}
          billingBusy={billingBusy}
          onUpgrade={onUpgrade}
          onManage={onManage}
        />

        {/* ======== Devices ======== */}
        <motion.section variants={tileIn} className={`${TILE} col-span-12`}>
          <TileHeader
            icon={<DevicesIcon />}
            title="Devices"
            caption="Sessions expire after 7 days"
            right={
              <span className="flex-none rounded-[var(--radius-pill)] bg-[var(--color-pill-bg)] px-2.5 py-1 text-[0.76rem] font-semibold text-[var(--color-ink-muted)]">
                {devices?.length ?? 0} active
              </span>
            }
          />
          {/* Capped scroller — the same 252px convention as the analytics KPI
              list, so one app pattern governs both long lists. */}
          <ul className="m-0 mt-2 flex max-h-[252px] list-none flex-col overflow-y-auto p-0">
            {devices === null && (
              <li className="py-2 text-[0.85rem] text-[var(--color-ink-faint)]">
                Loading devices…
              </li>
            )}
            {devices !== null && devices.length === 0 && (
              <li className="py-2 text-[0.85rem] text-[var(--color-ink-faint)]">
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
                      <span className="truncate text-[0.9rem] font-semibold">{d.device}</span>
                      {d.current && (
                        <span className="flex-none rounded-[var(--radius-pill)] border border-[var(--color-accent)] px-2 py-0.5 text-[0.7rem] font-semibold text-[var(--color-accent)]">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="text-[0.76rem] text-[var(--color-ink-faint)]">
                      Added {timeAgo(d.created_at)} · Active {timeAgo(d.last_seen_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevokeDevice(d.id)}
                    className="btn-base btn-ghost shrink-0 border border-[var(--color-border-soft)] px-3 py-1.5 text-[0.84rem]"
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
        </motion.section>

        {/* ======== Danger strip ======== */}
        <motion.section
          variants={tileIn}
          className="col-span-12 flex min-w-0 flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-danger-border)] bg-[rgba(239,68,68,0.03)] p-5 shadow-[var(--shadow-card)]"
        >
          <span className="grid size-9 flex-none place-items-center rounded-[var(--radius-icon)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
            <AlertIcon />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.95rem] font-semibold leading-tight text-[var(--color-danger)]">
              Delete account
            </div>
            <p className="mb-0 mt-0.5 text-[0.84rem] leading-relaxed text-[var(--color-ink-muted)]">
              Not self-service yet. The privacy policy promises deletion on request — email us and
              it is done, with your teams handed over first.
            </p>
          </div>
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}?subject=${encodeURIComponent("Delete account")}`}
              className="btn-base btn-ghost flex-none border border-[var(--color-danger-border)] px-4 py-2.5 text-[0.85rem] font-semibold text-[var(--color-danger)]"
            >
              Email us
            </a>
          )}
        </motion.section>
      </motion.div>
    </div>
  );
}
