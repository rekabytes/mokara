"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { tickVariants } from "@/lib/motion";
import { cn } from "@/lib/cn";
import {
  SERIES,
  WINDOW_DAYS,
  fmtDate,
  trailingDates,
  normalizeWindowSeries,
  type SeriesKey,
} from "./analytics-model";
import { ChartTooltip } from "./ChartTooltip";
import type { useAnalyticsData } from "./use-analytics-data";

type Props = Pick<ReturnType<typeof useAnalyticsData>, "data" | "loading" | "error" | "load">;

export function ActivityCard({ data, loading, error, load }: Props) {
  // Preserve the page-lifetime trailing window, anchored on local calendar days.
  const windowDates = useMemo(() => trailingDates(new Date(), WINDOW_DAYS), []);
  const [visible, setVisible] = useState<Set<SeriesKey>>(
    new Set(["created", "in_progress", "completed", "canceled"])
  );
  function toggle(k: SeriesKey) {
    setVisible((v) => {
      const next = new Set(v);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const visibleSeries = useMemo(() => SERIES.filter((s) => visible.has(s.key)), [visible]);

  // Normalize the API series into one row per day of the window. The
  // backend starts its series at the oldest event, so the early days of a
  // young team's window may be missing (→ zero, or carried forward from
  // whatever the previous day held). The window is always complete — no
  // empty states.
  const windowSeries = useMemo(() => normalizeWindowSeries(data, windowDates), [data, windowDates]);

  return (
    <section
      aria-labelledby="activity-history-title"
      aria-describedby="activity-history-description"
      className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="activity-history-title" className="m-0 text-[0.8rem] font-semibold">
          Activity history
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {SERIES.map((s) => {
            const on = visible.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-[999px] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] px-2.5 py-1 text-[0.72rem] font-medium transition-colors hover:bg-[var(--color-surface-2)]",
                  !on && "opacity-45"
                )}
                aria-pressed={on}
              >
                <span className="block size-2 rounded-[50%]" style={{ background: s.token }} />
                {s.label}
                <AnimatePresence>
                  {on && (
                    <motion.svg
                      key="tick"
                      variants={tickVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-[var(--color-ink-faint)]"
                      aria-hidden
                    >
                      <path d="M4 12.5l5 5L20 6.5" />
                    </motion.svg>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
      </div>

      <p
        id="activity-history-description"
        className="mb-3 mt-1 text-[0.75rem] leading-relaxed text-[var(--color-ink-muted)]"
      >
        Cumulative events, not current task counts. Completed or reopened tasks keep their earlier
        activity here. See Current distribution for tasks currently in each status.
      </p>
      <div className="h-[340px]">
        {loading && !data ? (
          <div className="grid h-full place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
            Loading…
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
            {error.message}
            <button
              type="button"
              onClick={load}
              className="ml-2 cursor-pointer text-[var(--color-accent)] underline"
            >
              Retry
            </button>
          </div>
        ) : data && visibleSeries.length === 0 ? (
          <div className="grid h-full place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
            Tick a series to compare.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={windowSeries} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                interval={0}
                tickMargin={8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={32}
                allowDecimals={false}
                domain={[0, (dataMax: number) => Math.max(1, Math.ceil(dataMax * 1.1))]}
              />
              <Tooltip
                content={(props) => (
                  <ChartTooltip {...props} visible={visible} series={windowSeries} />
                )}
                cursor={{ stroke: "rgba(15,23,42,0.22)", strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  stroke={s.color}
                  type="monotone"
                  strokeWidth={1.6}
                  dot={false}
                  activeDot={{ r: 3.5, fill: "#fff", stroke: s.color, strokeWidth: 1.8 }}
                  hide={!visible.has(s.key)}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 px-1 text-[0.7rem] text-[var(--color-ink-faint)]">
        Cumulative event totals shown over the last {WINDOW_DAYS} days. The same task can be counted
        more than once. Hover a day for its cumulative total and new events.
      </p>
    </section>
  );
}
