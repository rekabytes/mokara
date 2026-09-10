"use client";

// The "Plan & billing" hero tile: the account's current plan and its live caps
// on the left, and — only on a billing-enabled instance while the plan is Free —
// the Starter upgrade pitch on the right.
//
// Presentational: it takes `billing`, the derived `showPitch`, the in-flight
// `billingBusy` flag and the two handlers, and owns no fetching. The page keeps
// `loadBilling` and the sync-then-read on mount (the dev-mode lifeline when a
// webhook cannot reach localhost), so the trap site does not move with the tile.
//
// `variants={tileIn}` with NO `initial`/`animate` of its own is deliberate: the
// tile inherits the parent stagger's variant labels, so adding either here would
// break the one-shot entrance the other tiles share.

import { motion } from "framer-motion";
import { CardIcon, CheckIcon, Eyebrow, Stat, TILE, TileHeader } from "./settings-chrome";
import {
  STARTER_PRICE,
  capGb,
  capMb,
  capNum,
  capWord,
  fmtMemberSince,
  pitchRows,
} from "./billing-copy";
import type { BillingInfo } from "@/lib/api";
import { tileIn } from "@/lib/motion";

export function BillingTile({
  billing,
  showPitch,
  billingBusy,
  onUpgrade,
  onManage,
}: {
  billing: BillingInfo | null;
  showPitch: boolean;
  billingBusy: boolean;
  onUpgrade: () => void;
  onManage: () => void;
}) {
  return (
    <motion.section variants={tileIn} className={`${TILE} col-span-12`}>
      <TileHeader accent icon={<CardIcon />} title="Plan & billing" />

      {billing?.grace_until && (
        <p className="mb-0 mt-4 rounded-[var(--radius-btn)] border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] px-3 py-2 text-[0.84rem] text-[var(--color-warning)]">
          A payment failed — paid features stay on until {fmtMemberSince(billing.grace_until)}.
          Update your card in the billing portal.
        </p>
      )}

      <div className={showPitch ? "mt-5 grid items-start gap-5 lg:grid-cols-2" : "mt-5"}>
        {/* Left: the account's current plan and its live limits */}
        <div className="min-w-0">
          <Eyebrow>Current plan</Eyebrow>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-[2.1rem] font-semibold leading-none tracking-[-0.01em]">
              {billing ? capWord(billing.plan) : "…"}
            </span>
            {billing?.period_end && (
              <span className="text-[0.79rem] text-[var(--color-ink-faint)]">
                Renews {fmtMemberSince(billing.period_end)}
              </span>
            )}
            {billing && billing.plan === "free" && !billing.period_end && (
              <span className="text-[0.79rem] text-[var(--color-ink-faint)]">No card required</span>
            )}
          </div>
          <div
            className={`mt-4 grid gap-2.5 ${
              showPitch ? "grid-cols-2" : "grid-cols-2 min-[560px]:grid-cols-4"
            }`}
          >
            <Stat value={capNum(billing?.caps.members)} label="members / team" />
            <Stat value={capNum(billing?.caps.teams)} label="team workspaces" />
            <Stat value={capGb(billing?.caps.storage_bytes)} label="storage" />
            <Stat value={capMb(billing?.caps.file_bytes)} label="per file" />
          </div>
        </div>

        {/* Right: the upgrade pitch — only when Free on a billing-enabled
            instance. Everything numeric comes from the tier ladder. */}
        {showPitch && billing && (
          <div className="min-w-0 rounded-[var(--radius-card)] border border-[var(--color-accent)]/20 bg-[var(--color-accent-soft)] p-4">
            <Eyebrow accent>Upgrade to Starter</Eyebrow>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-display text-[2.1rem] font-semibold leading-none tracking-[-0.01em]">
                {STARTER_PRICE}
              </span>
              <span className="text-[0.85rem] font-medium text-[var(--color-ink-muted)]">
                / month
              </span>
            </div>
            <ul className="mb-0 mt-3.5 grid list-none gap-x-4 gap-y-2 p-0 min-[560px]:grid-cols-2">
              {pitchRows(billing).map((row) => (
                <li key={row} className="flex items-center gap-2 text-[0.85rem]">
                  <span className="flex-none text-[var(--color-accent)]">
                    <CheckIcon />
                  </span>
                  <span className="font-medium">{row}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={billingBusy}
                onClick={onUpgrade}
                className="btn-base btn-primary px-4 py-2 text-[0.86rem]"
              >
                Upgrade now
              </button>
              <span className="text-[0.75rem] text-[var(--color-ink-muted)]">
                Instant activation · cancel anytime
              </span>
            </div>
          </div>
        )}
      </div>

      {billing !== null && (billing.has_subscription || !billing.billing_configured) && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-[var(--color-border-soft)] pt-4">
          {billing.billing_configured && billing.has_subscription && (
            <button
              type="button"
              disabled={billingBusy}
              onClick={onManage}
              className="btn-base btn-ghost border border-[var(--color-border-soft)] px-3.5 py-2 text-[0.85rem]"
            >
              Manage billing
            </button>
          )}
          {!billing.billing_configured && (
            <p className="m-0 text-[0.79rem] text-[var(--color-ink-faint)]">
              Billing isn’t enabled on this instance — self-hosted installs run every plan
              unlimited, with no payments.
            </p>
          )}
        </div>
      )}
    </motion.section>
  );
}
