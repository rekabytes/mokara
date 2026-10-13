"use client";

import { motion } from "framer-motion";
import { ErrorBanner } from "@/components/ErrorBanner";
import { tileIn } from "@/lib/motion";
import { timeAgo } from "./billing-copy";
import { DevicesIcon, TILE, TileHeader } from "./settings-chrome";
import { useSettingsDevices } from "./use-settings-devices";

export function DevicesTile({
  devices,
  devicesError,
  devicesBusy,
  loadDevices,
  onRevokeDevice,
  onRevokeAll,
}: ReturnType<typeof useSettingsDevices>) {
  return (
    <motion.section variants={tileIn} className={`${TILE} col-span-12`}>
      <TileHeader
        icon={<DevicesIcon />}
        title="Devices"
        caption="Sessions expire after 7 days"
        right={
          <span className="flex-none rounded-[var(--radius-pill)] bg-[var(--color-pill-bg)] px-2.5 py-1 text-[0.76rem] font-semibold text-[var(--color-ink-muted)]">
            {devices?.length ?? "—"} active
          </span>
        }
      />
      <ErrorBanner className="mt-2" message={devicesError?.message} />
      {devicesError && (
        <button
          type="button"
          className="btn-base btn-ghost mt-2"
          onClick={() => void loadDevices()}
        >
          Retry devices
        </button>
      )}
      {/* Capped scroller — the same 252px convention as the analytics KPI
              list, so one app pattern governs both long lists. */}
      <ul className="m-0 mt-2 flex max-h-[252px] list-none flex-col overflow-y-auto p-0">
        {devices === null && !devicesError && (
          <li className="py-2 text-[0.85rem] text-[var(--color-ink-faint)]">Loading devices…</li>
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
                disabled={devicesBusy}
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
        disabled={devicesBusy}
        onClick={onRevokeAll}
        className="btn-base btn-ghost mt-3 w-full border border-[var(--color-danger-border)] text-[var(--color-danger-ink)]"
      >
        Sign out everywhere
      </button>
    </motion.section>
  );
}
