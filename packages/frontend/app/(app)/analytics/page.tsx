"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { tickVariants } from "@/lib/motion";
import { cn } from "@/lib/cn";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  api,
  type Analytics,
  type AnalyticsSeriesItem,
  type KpiProgress,
  type Progress,
} from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { useContainers } from "@/lib/containers";
import { PageHeader } from "@/components/PageHeader";

import {
  LIST_VISIBLE_ROWS,
  MONTH_NAMES,
  SERIES,
  WINDOW_DAYS,
  fmtDate,
  monthStartPx,
  pct,
  totalTasks,
  trailingDates,
  type SeriesKey,
} from "./analytics-model";
import { ChartTooltip } from "./ChartTooltip";
import { ProgressGantt } from "./ProgressGantt";

// PRD-04 phase 3 — team activity chart. Lines plot cumulative running
// totals (created, started, finished, canceled) so the line never drops
// on quiet days; the hover tooltip shows the total + today's delta.
// The window is a trailing `WINDOW_DAYS`-day range that ENDS on today,
// so the right edge is always the current date and every day in between
// gets its own tick on the x-axis.

export default function AnalyticsPage() {
  // PRD-06: container comes from the global switcher atoms.
  const { selected } = useContainers();
  const teamId = selected?.id ?? null;
  // Trailing window: today is the right edge, `WINDOW_DAYS` - 1 days ago
  // is the left edge. Sent as the API `range`, which already counts days
  // back from today. (The PRD-09 range control was dropped by owner
  // decision — the chart stays fixed at 14.)
  const windowDates = useMemo(() => trailingDates(new Date(), WINDOW_DAYS), []);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const { error, setError, run } = useAsyncError();
  const { error: progressError, setError: setProgressError, run: runProgress } = useAsyncError();
  const { error: kpiError, setError: setKpiError, run: runKpiProgress } = useAsyncError();
  const [kpiProgress, setKpiProgress] = useState<KpiProgress[] | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressLoading, setProgressLoading] = useState(true);
  // The heatmap's scroll container, reached from the month dropdown's onChange.
  // Owning it here is what removes the "watch jumpMonth, then scroll" effect.
  const ganttScrollRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState<Set<SeriesKey>>(
    new Set(["created", "in_progress", "completed", "canceled"])
  );

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    const a = await run(() => api.getAnalytics(teamId, WINDOW_DAYS), {
      fallback: "Couldn't load analytics",
    });
    setLoading(false);
    if (a) setData(a);
  }, [teamId, run, setError]);

  const loadProgress = useCallback(async () => {
    if (!teamId) return;
    setProgressLoading(true);
    setProgressError(null);
    const p = await runProgress(() => api.getProgress(teamId), {
      fallback: "Couldn't load progress",
    });
    setProgressLoading(false);
    if (p) setProgress(p);
  }, [teamId, runProgress, setProgressError]);

  const loadKpiProgress = useCallback(async () => {
    if (!teamId) return;
    setKpiLoading(true);
    setKpiError(null);
    const res = await runKpiProgress(() => api.getKpiProgress(teamId), {
      fallback: "Couldn't load KPI progress",
    });
    setKpiLoading(false);
    if (res) setKpiProgress(res.kpis);
  }, [teamId, runKpiProgress, setKpiError]);

  // One effect for the three reads this page makes. Each loader is still
  // separate because every card has its own Retry button, but the trigger is
  // now a single server-sync — three near-identical `useEffect(() => x(), [x])`
  // chains was three chances to get a dependency wrong.
  //
  // The `!teamId` branch is the bug this consolidates: the loaders returned
  // early there without ever clearing their own `loading` flag, which is
  // initialised to true — so an account with no containers sat on "Loading…"
  // on all three cards, forever.
  const loadAll = useCallback(() => {
    if (!teamId) {
      setLoading(false);
      setProgressLoading(false);
      setKpiLoading(false);
      return;
    }
    return Promise.all([load(), loadProgress(), loadKpiProgress()]);
  }, [teamId, load, loadProgress, loadKpiProgress]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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
  const windowSeries = useMemo(() => {
    if (!data) return [];
    const byDate = new Map(data.series.map((d) => [d.date, d]));
    const rows: AnalyticsSeriesItem[] = [];
    for (const date of windowDates) {
      const got = byDate.get(date);
      if (got) {
        rows.push(got);
        continue;
      }
      const prev = rows[rows.length - 1];
      rows.push({
        date,
        created: prev?.created ?? 0,
        in_progress: prev?.in_progress ?? 0,
        completed: prev?.completed ?? 0,
        canceled: prev?.canceled ?? 0,
      });
    }
    return rows;
  }, [data, windowDates]);

  return (
    <div>
      {/* Top bar: breadcrumb + actions — same as the Tasks/Team pages */}
      <PageHeader>Analytics</PageHeader>

      {/* Progress card */}
      {data && (
        <section className="mt-3 mb-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[0.8rem] font-semibold">Current distribution</span>
            <span className="text-[0.78rem] text-[var(--color-ink-muted)]">
              <b className="font-semibold text-[var(--color-ink)]">{pct(data.totals)}%</b> of{" "}
              {totalTasks(data.totals)} tasks completed
            </span>
          </div>
          <ProgressBar totals={data.totals} />
          <div className="mt-3 flex flex-wrap gap-3.5">
            {[
              { key: "completed" as const, label: "Completed", token: "var(--color-accent)" },
              { key: "in_progress" as const, label: "In progress", token: "var(--color-warning)" },
              { key: "open" as const, label: "Open", token: "rgba(148,163,184,0.55)" },
              { key: "canceled" as const, label: "Canceled", token: "var(--color-danger)" },
            ].map((s) => (
              <span
                key={s.key}
                className="flex items-center gap-1.5 text-[0.75rem] text-[var(--color-ink-muted)]"
              >
                <span className="block size-2 rounded-[3px]" style={{ background: s.token }} />
                {s.label}{" "}
                <span className="font-semibold text-[var(--color-ink)]">{data.totals[s.key]}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Progress card — day-cell heatmap per task */}
      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.8rem] font-semibold">
            Progress{" "}
            <span className="font-normal text-[var(--color-ink-faint)]">
              · {progress?.tasks.length ?? 0} tasks
            </span>
          </span>
          <select
            // Uncontrolled: the only thing this dropdown does is scroll a DOM
            // node, which it can do straight from onChange. It used to write a
            // `jumpMonth` state that an effect watched — state whose sole
            // purpose was to be noticed by an effect.
            defaultValue=""
            onChange={(e) => {
              const el = ganttScrollRef.current;
              if (!el) return;
              const month = e.target.value;
              if (month === "") return;
              el.scrollLeft = Math.max(0, monthStartPx(new Date().getFullYear(), Number(month)));
            }}
            aria-label="Jump to month"
            className="cursor-pointer rounded-[999px] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] px-3 py-1.5 text-[0.78rem] font-medium text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          >
            <option value="" disabled>
              Jump to month…
            </option>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {progressLoading && !progress ? (
          <div className="grid h-[120px] place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
            Loading…
          </div>
        ) : progressError ? (
          <div className="grid h-[120px] place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
            {progressError.message}
            <button
              type="button"
              onClick={loadProgress}
              className="ml-2 cursor-pointer text-[var(--color-accent)] underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <ProgressGantt tasks={progress?.tasks ?? []} scrollRef={ganttScrollRef} />
        )}
      </section>

      {/* KPI progress card — weighted: Σ(weight × status) ÷ Σ(weight) */}
      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.8rem] font-semibold">
            KPI progress{" "}
            <span className="font-normal text-[var(--color-ink-faint)]">
              · {kpiProgress?.length ?? 0} KPIs
            </span>
          </span>
          <span className="text-[0.7rem] text-[var(--color-ink-faint)]">
            Σ(weight × status) ÷ Σ(weight) · canceled excluded
          </span>
        </div>
        {kpiLoading && !kpiProgress ? (
          <div className="grid h-[80px] place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
            Loading…
          </div>
        ) : kpiError ? (
          <div className="grid h-[80px] place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
            {kpiError.message}
            <button
              type="button"
              onClick={loadKpiProgress}
              className="ml-2 cursor-pointer text-[var(--color-accent)] underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="relative">
            {/* PRD-09: 7 KPIs visible, the rest behind the card's own
                vertical scrollbar — same cap as the heatmap above. */}
            <ul className="m-0 flex max-h-[252px] list-none flex-col gap-0.5 overflow-y-auto p-0">
              {(kpiProgress ?? []).map((k) => (
                <li key={k.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-[180px] shrink-0 truncate text-[0.8rem] font-medium text-[var(--color-ink)]">
                    {k.name}
                  </span>
                  <span className="pill shrink-0">{k.owner_username}</span>
                  <span className="flex h-2 flex-1 overflow-hidden rounded-[999px] bg-[rgba(148,163,184,0.18)]">
                    <span
                      className="h-full rounded-[999px] bg-[var(--color-accent)] transition-[width] duration-300"
                      style={{ width: `${k.progress}%` }}
                    />
                  </span>
                  <span className="w-[42px] shrink-0 text-right font-mono text-[0.76rem] text-[var(--color-ink)]">
                    {k.progress}%
                  </span>
                  <span className="w-[92px] shrink-0 text-right text-[0.72rem] text-[var(--color-ink-faint)]">
                    {k.task_count} tied · Σ{k.weight_sum}
                  </span>
                </li>
              ))}
              {(kpiProgress ?? []).length === 0 && (
                <li className="py-2 text-[0.78rem] text-[var(--color-ink-faint)]">
                  No KPIs in this container yet — create them on the team page, then weight tasks
                  toward them from the task drawer.
                </li>
              )}
            </ul>
            {kpiProgress !== null && kpiProgress.length > LIST_VISIBLE_ROWS && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
                <span className="rounded-[999px] bg-[var(--color-surface-solid)]/90 px-3 py-1 text-[0.72rem] text-[var(--color-ink-faint)] shadow-[var(--shadow-card)]">
                  {kpiProgress.length - LIST_VISIBLE_ROWS} more KPIs below
                </span>
              </div>
            )}
          </div>
        )}
      </section>
      {/* Chart card */}
      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.8rem] font-semibold">Activity over time</span>
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
                  allowDecimals
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
          Running totals over the last {WINDOW_DAYS} days, ending today. Hover any day for the total
          and new events.
        </p>
      </section>
    </div>
  );
}

function ProgressBar({ totals }: { totals: Analytics["totals"] }) {
  const total = totalTasks(totals);
  if (total === 0) return <div className="h-2.5 rounded-[999px] bg-[rgba(148,163,184,0.18)]" />;
  const segs: { key: string; n: number; bg: string }[] = [
    { key: "completed", n: totals.completed, bg: "var(--color-accent)" },
    { key: "in_progress", n: totals.in_progress, bg: "var(--color-warning)" },
    { key: "open", n: totals.open, bg: "rgba(148,163,184,0.55)" },
    { key: "canceled", n: totals.canceled, bg: "var(--color-danger)" },
  ];
  return (
    <div className="flex h-2.5 overflow-hidden rounded-[999px] bg-[rgba(148,163,184,0.18)]">
      {segs.map((s) => (
        <div
          key={s.key}
          style={{ width: `${(s.n / total) * 100}%`, background: s.bg }}
          className="h-full transition-[width] duration-300"
        />
      ))}
    </div>
  );
}

// cn lives in lib/cn.ts (clsx + tailwind-merge) — this page carried a local
// copy that only did the clsx half of the job.
