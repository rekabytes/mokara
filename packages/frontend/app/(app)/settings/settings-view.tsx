"use client";

import { motion } from "framer-motion";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageHeader } from "@/components/PageHeader";
import { SocialSignIn } from "@/components/SocialSignIn";
import { useSession } from "@/lib/session";
import { useContainers } from "@/lib/containers";
import { tileIn, tileStagger } from "@/lib/motion";
import { BillingTile } from "./BillingTile";
import { AIConnectionsTile } from "./AIConnectionsTile";
import { GitHubTile } from "./GitHubTile";
import { ProfileTile } from "./ProfileTile";
import { PasswordTile } from "./PasswordTile";
import { DevicesTile } from "./DevicesTile";
import { useSettingsDevices } from "./use-settings-devices";
import { useSettingsBilling } from "./use-settings-billing";
import { AlertIcon, TILE } from "./settings-chrome";

// Settings owns page composition and the shared action-error banner. Forms
// own their drafts; route-local hooks own the device and billing lifecycles.

export function SettingsView({ contactEmail }: { contactEmail: string | null }) {
  const session = useSession();
  const { containers } = useContainers();
  const { error, setError, clearError, run } = useAsyncError();
  const user = session.status === "authed" ? session.user : null;

  const deviceState = useSettingsDevices({ run, clearError });
  const { billing, billingError, billingBusy, loadBilling, onUpgrade, onManage, showPitch } =
    useSettingsBilling({ run, clearError, containers });

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
        <ProfileTile
          run={run}
          clearError={clearError}
          deviceCount={deviceState.devices?.length ?? null}
          containerCount={containers.length}
        />

        {/* ======== Password ======== */}
        <PasswordTile
          run={run}
          clearError={clearError}
          setError={setError}
          passwordLoginEnabled={user?.password_login_enabled ?? false}
        />

        <section className={`${TILE} col-span-12`}>
          <h2 className="text-base font-semibold">Sign-in methods</h2>
          <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
            Connect an account to sign in to this same Mokara account. GitHub sign-in is separate
            from repository integration.
          </p>
          <SocialSignIn intent="link" />
        </section>

        {/* ======== Plan & billing — the hero ======== */}
        {billingError && (
          <div className="col-span-12">
            <ErrorBanner message={billingError.message} />
            <button
              type="button"
              className="btn-base btn-ghost mt-2"
              onClick={() => void loadBilling()}
            >
              Retry plan
            </button>
          </div>
        )}
        <BillingTile
          billing={billing}
          showPitch={showPitch}
          billingBusy={billingBusy}
          onUpgrade={onUpgrade}
          onManage={onManage}
        />

        {/* ======== Personal integrations ======== */}
        <GitHubTile run={run} />
        <AIConnectionsTile containers={containers} />

        {/* ======== Devices ======== */}
        <DevicesTile {...deviceState} />

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
