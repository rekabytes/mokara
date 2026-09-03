"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DUR, snap, tickVariants } from "@/lib/motion";
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
  type ProgressTask,
} from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { useContainers } from "@/lib/containers";

// PRD-04 phase 3 — team activity chart. Lines plot cumulative running
// totals (created, started, finished, canceled) so the line never drops
// on quiet days; the hover tooltip shows the total + today's delta.
// The window is a trailing `WINDOW_DAYS`-day range that ENDS on today,
// so the right edge is always the current date and every day in between
// gets its own tick on the x-axis.

type SeriesKey = keyof Omit<AnalyticsSeriesItem, "date">;

const WINDOW_DAYS = 14;

// One YYYY-MM-DD per day of the window, oldest first, today last.
// Local date math throughout — round-tripping through toISOString()
// shifts the day back in +UTC timezones.
function trailingDates(today: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1) + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  });
}

const SERIES: { key: SeriesKey; label: string; color: string; token: string }[] = [
  { key: "created", label: "Created", color: "#0ea5e9", token: "var(--color-created)" },
  { key: "in_progress", label: "In progress", color: "#a16207", token: "var(--color-warning)" },
  { key: "completed", label: "Completed", color: "#6366f1", token: "var(--color-accent)" },
  { key: "canceled", label: "Canceled", color: "#ef4444", token: "var(--color-danger)" },
];

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: "short" })
);

function fmtDate(iso: string): string {
  // iso is a YYYY-MM-DD date (UTC). Parse parts to avoid TZ drift.
  const [, m, d] = iso.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

/**
 * Index of a local date within its year (0 = Jan 1). Anchored on local
 * midnight parts, never a live timestamp — see the heatmap's "two different
 * todays" note. Used by the month ruler and by the "Jump to month" handler,
 * which is what lets the jump be a plain event handler instead of an effect
 * watching a `jumpMonth` state.
 */
function dayIdxOfYear(year: number, d: Date): number {
  return Math.round((d.getTime() - new Date(year, 0, 1).getTime()) / DAY_MS);
}

function monthStartPx(year: number, month: number): number {
  return dayIdxOfYear(year, new Date(year, month, 1)) * DAY_WIDTH;
}

export default function AnalyticsPage() {
  // PRD-06: container comes from the global switcher atoms.
  const { selected } = useContainers();
  const teamId = selected?.id ?? null;
  // Trailing window: today is the right edge, `WINDOW_DAYS` - 1 days ago
  // is the left edge. Sent as the API `range`, which already counts days
  // back from today.
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
      <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] py-1">
        <div className="flex items-center gap-[0.4rem] text-[0.92rem] font-semibold">
          <span className="text-[var(--color-ink-muted)]">Mokara</span>
          <span className="text-[var(--color-ink-faint)]">›</span>
          <span>Analytics</span>
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

      {/* Chart card */}
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
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

      {/* Progress card — day-cell heatmap per task */}
      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.8rem] font-semibold">Progress</span>
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
          <span className="text-[0.8rem] font-semibold">KPI progress</span>
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
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
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
        )}
      </section>
    </div>
  );
}

// Progress card — day-cell heatmap. Every calendar day of the year is one
// box in the same grid column as its date number, so a box under "3" IS
// the 3rd (the old bars snapped to column edges and read half a day off).
// Cell colour = what was true on that day: hollow grey = created but not
// started, dotted = planned days still ahead of us, indigo = in progress,
// red = past the deadline, green = completed. The deadline day wears a
// dark ring, a moved deadline an amber tick, the finish day a check.
// The full year (Jan 1 → Dec 31, 60px/day) always lays out end-to-end;
// pan via native scroll or click-and-drag, title column stays pinned.
const DAY_MS = 86400000;
const DAY_WIDTH = 60;
const TITLE_COL = 160;
const AXIS_HEIGHT = 44;
const ROW_H = 38;
const CELL_H = 26;

type HeatState = "waiting" | "upcoming" | "active" | "done" | "late" | "ghost";

const HEAT_CLASS: Record<HeatState, string> = {
  waiting: "bg-[rgba(148,163,184,0.13)] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]",
  upcoming: "border border-dashed border-[rgba(148,163,184,0.5)]",
  active: "bg-[rgba(99,102,241,0.88)]",
  done: "bg-[rgba(21,128,61,0.92)]",
  late: "bg-[rgba(239,68,68,0.9)]",
  ghost: "",
};

const HEAT_WORD: Record<HeatState, string> = {
  waiting: "Not started",
  upcoming: "Upcoming",
  active: "In progress",
  done: "Completed",
  late: "Overdue",
  ghost: "Deadline day",
};

type HeatCell = {
  col: number; // 0-based day index in the year window (grid column - 1)
  ms: number; // UTC midnight of that day, for the tooltip date
  state: HeatState;
  due: boolean; // deadline day → dark ring
  moved: boolean; // an old deadline landed here → amber tick
  finished: boolean; // the day the task completed → check mark
  flags: string; // prebuilt tooltip suffix (" · deadline" …)
};

type HeatRowData = { id: string; title: string; dot: string; cells: HeatCell[] };

function ProgressGantt({
  tasks,
  scrollRef,
}: {
  tasks: ProgressTask[];
  // The page owns this ref so its "Jump to month" dropdown can scroll the track
  // from an event handler. The month math is the same `monthStartPx` helper.
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const todayStr = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const [hover, setHover] = useState<{ rowId: string; col: number; x: number; y: number } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startScroll: 0 });

  // Window = Jan 1 → Dec 31 of the current year (always 365 or 366 days).
  const startMs = Date.parse(`${year}-01-01`);
  const totalDays = Math.round((Date.parse(`${year}-12-31`) - startMs) / DAY_MS) + 1;
  const trackWidth = totalDays * DAY_WIDTH;
  // Local date math (not toISOString round-trips) so +UTC timezones don't
  // shift month starts back a day and collide day keys.
  const dayIdxOf = useCallback((d: Date) => dayIdxOfYear(year, d), [year]);
  const dayIdx = useCallback(
    (iso: string) =>
      Math.max(0, Math.min(totalDays - 1, (Date.parse(iso.slice(0, 10)) - startMs) / DAY_MS)),
    [totalDays, startMs]
  );
  // Memoised so the center-today effect can list it honestly: an unstable
  // `xPx` in that dependency array would re-run the effect on every render and
  // fight the user's own scrolling.
  const xPx = useCallback((iso: string) => dayIdx(iso) * DAY_WIDTH, [dayIdx]);

  // Drag-to-scroll: track the mousedown anchor, update scrollLeft on move.
  // Document listeners that only exist while a drag is in flight — outside
  // React, so the effect stays. (motion's `drag` is not a free substitute
  // here: it fights native overflow scrolling and needs measured
  // dragConstraints, which is another effect.)
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft =
        dragRef.current.startScroll - (e.clientX - dragRef.current.startX);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, scrollRef]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setHover(null);
    dragRef.current = {
      startX: e.clientX,
      startScroll: scrollRef.current?.scrollLeft ?? 0,
    };
  };

  // Center today on first paint. Reading `clientWidth` and writing `scrollLeft`
  // is raw DOM work with no declarative form, so this effect stays — it is the
  // definition of syncing with something outside React. (useLayoutEffect would
  // remove the one-frame jump but this component still server-renders, which is
  // how Next earns a warning.)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const visible = el.clientWidth - TITLE_COL;
    const target = Math.max(0, xPx(todayStr) - visible / 2);
    el.scrollLeft = target;
  }, [scrollRef, xPx, todayStr]);

  if (tasks.length === 0) {
    return <div className="h-[40px]" />;
  }

  // Local MIDNIGHT of today. dayIdxOf(now) with the live time-of-day would
  // round past local noon up to TOMORROW (e.g. 13:45 → 244.57 → 245 = Sep 3),
  // dragging the today line and every cutoff with it.
  const todayIdx = dayIdxOf(new Date(year, now.getMonth(), now.getDate()));

  // Per-task cell states. A task jumped straight to done (never in progress)
  // counts as having started when it was completed, so finished work always
  // gets a mark. Days past the deadline and still ahead of us stay empty.
  const rowsData: HeatRowData[] = tasks.map((t) => {
    const createdIdx = dayIdx(t.created_at);
    const dueIdx = dayIdx(t.due_date);
    const doneIdx = t.completed_at ? dayIdx(t.completed_at) : null;
    const startedIdx = t.started_at ? dayIdx(t.started_at) : null;
    const movedDays = new Set(
      // flatMap with a truthy check instead of filter-then-`ch.from_due!`: the
      // compiler does the narrowing with us rather than around us.
      t.due_changes.flatMap((ch) => (ch.from_due ? [dayIdx(ch.from_due)] : []))
    );
    const doneOnTime = doneIdx != null && doneIdx <= dueIdx;
    const dot =
      doneIdx != null
        ? doneOnTime
          ? "var(--color-success)"
          : "var(--color-danger)"
        : startedIdx != null
          ? todayIdx > dueIdx
            ? "var(--color-danger)"
            : "var(--color-accent)"
          : "var(--color-ink-faint)";
    const state = (idx: number): HeatState | null => {
      if (idx < createdIdx) return null;
      if (doneIdx != null && idx > doneIdx) return idx === dueIdx ? "ghost" : null;
      if (idx > dueIdx && idx > todayIdx) return null;
      if (idx > todayIdx) return "upcoming";
      const sIdx = startedIdx ?? doneIdx;
      if (sIdx != null && idx >= sIdx) {
        if (doneIdx != null) return doneOnTime ? "done" : idx > dueIdx ? "late" : "active";
        return idx > dueIdx ? "late" : "active";
      }
      return idx > dueIdx ? "late" : "waiting";
    };
    const end = Math.min(
      totalDays - 1,
      Math.max(dueIdx, doneIdx ?? dueIdx, Math.min(todayIdx, dueIdx))
    );
    const cells: HeatCell[] = [];
    for (let idx = createdIdx; idx <= end; idx++) {
      const s = state(idx);
      if (!s) continue;
      cells.push({
        col: idx,
        ms: startMs + idx * DAY_MS,
        state: s,
        due: idx === dueIdx,
        moved: movedDays.has(idx),
        finished: doneIdx != null && idx === doneIdx,
        flags:
          (idx === dueIdx ? " · deadline" : "") +
          (movedDays.has(idx) ? " · old deadline" : "") +
          (doneIdx != null && idx === doneIdx ? " · finished" : ""),
      });
    }
    return { id: t.id, title: t.title, dot, cells };
  });

  // Weekend columns + today, tinted once behind all rows (not per row).
  const tints: { col: number; today: boolean }[] = [];
  for (let idx = 0; idx < totalDays; idx++) {
    const dow = new Date(startMs + idx * DAY_MS).getUTCDay();
    if (dow === 0 || dow === 6) tints.push({ col: idx, today: false });
  }
  tints.push({ col: todayIdx, today: true });

  // Hover follows the cell under the cursor; the tooltip text is composed
  // from the row/cell data here, never stored on the cell itself.
  function onCellMove(e: React.MouseEvent) {
    if (dragging) {
      setHover(null);
      return;
    }
    const cell = e.target instanceof HTMLElement ? e.target.closest("[data-col]") : null;
    if (!cell) {
      setHover(null);
      return;
    }
    const rowId = cell.closest("[data-row-id]")?.getAttribute("data-row-id") ?? "";
    const col = Number(cell.getAttribute("data-col"));
    setHover((h) =>
      h && h.rowId === rowId && h.col === col
        ? { ...h, x: e.clientX, y: e.clientY }
        : { rowId, col, x: e.clientX, y: e.clientY }
    );
  }

  // Month bands along the top: 12 segments sized by days-in-month.
  const months = Array.from({ length: 12 }, (_, i) => {
    const first = new Date(year, i, 1);
    return {
      name: first.toLocaleDateString(undefined, { month: "short" }),
      dayIdx: dayIdxOf(first),
    };
  });

  // Day numbers along the bottom: every calendar day, day number only.
  const dayLabels: { dayIdx: number; label: string }[] = [];
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const monthStartDayIdx = dayIdxOf(new Date(year, m, 1));
    for (let d = 1; d <= daysInMonth; d++) {
      dayLabels.push({ dayIdx: monthStartDayIdx + (d - 1), label: String(d) });
    }
  }

  return (
    <div className="min-w-0">
      <div
        ref={scrollRef}
        className={`relative overflow-x-auto min-w-0 max-w-full rounded-[6px] ${
          dragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
        onMouseDown={onMouseDown}
      >
        <div style={{ width: `${TITLE_COL + trackWidth}px` }}>
          {/* Axis row: sticky-blank + month/day header */}
          <div className="flex">
            <div
              className="sticky left-0 z-10 flex-none bg-[var(--color-surface-solid)] border-r border-[var(--color-border-soft)]"
              style={{ width: `${TITLE_COL}px`, height: `${AXIS_HEIGHT}px` }}
            />
            <div
              className="relative"
              style={{ width: `${trackWidth}px`, height: `${AXIS_HEIGHT}px` }}
            >
              {/* Month labels */}
              <div className="absolute inset-x-0 top-0 h-5 border-b border-[var(--color-border-soft)]">
                {months.map((m, idx) => {
                  const next = months[idx + 1];
                  const endDayIdx = next ? next.dayIdx : totalDays;
                  const w = (endDayIdx - m.dayIdx) * DAY_WIDTH;
                  return (
                    <div
                      key={m.name + idx}
                      className="absolute top-0 flex h-full items-center px-2 text-[0.7rem] font-semibold text-[var(--color-ink-muted)]"
                      style={{ left: `${m.dayIdx * DAY_WIDTH}px`, width: `${w}px` }}
                    >
                      {m.name}
                    </div>
                  );
                })}
              </div>
              {/* Day labels (every day) */}
              <div className="absolute inset-x-0 bottom-0 h-[18px]">
                {dayLabels.map((dl) => (
                  <div
                    key={dl.dayIdx}
                    className="absolute inset-y-0 flex items-start justify-center text-[0.6rem] text-[var(--color-ink-faint)]"
                    style={{ left: `${dl.dayIdx * DAY_WIDTH}px`, width: `${DAY_WIDTH}px` }}
                  >
                    {dl.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Task rows — one box per calendar day, aligned under its number */}
          <div
            className="relative"
            onMouseMove={onCellMove}
            onMouseOver={onCellMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* Weekend + today column tints (behind the cells) */}
            <div
              className="pointer-events-none absolute inset-y-0"
              style={{ left: `${TITLE_COL}px`, width: `${trackWidth}px` }}
            >
              {tints.map((t) => (
                <div
                  key={t.col}
                  className="absolute inset-y-0"
                  style={{
                    left: `${t.col * DAY_WIDTH}px`,
                    width: `${DAY_WIDTH}px`,
                    background: t.today ? "rgba(99,102,241,0.06)" : "rgba(15,23,42,0.028)",
                  }}
                >
                  {t.today && (
                    <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-[rgba(15,23,42,0.35)]" />
                  )}
                </div>
              ))}
            </div>
            {rowsData.map((r) => (
              <HeatRow key={r.id} row={r} totalDays={totalDays} />
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {hover &&
          (() => {
            const row = rowsData.find((r) => r.id === hover.rowId);
            const cell = row?.cells.find((c) => c.col === hover.col);
            return row && cell ? (
              <CellTooltip key="cell-tip" row={row} cell={cell} x={hover.x} y={hover.y} />
            ) : null;
          })()}
      </AnimatePresence>

      {/* Legend + hint */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[0.7rem] text-[var(--color-ink-muted)]">
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="block h-2.5 w-4 rounded-[3px] bg-[rgba(148,163,184,0.13)] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]" />
            Not started
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="block h-2.5 w-4 rounded-[3px] border border-dashed border-[rgba(148,163,184,0.5)]" />
            Upcoming
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="block h-2.5 w-4 rounded-[3px] bg-[rgba(99,102,241,0.88)]" />
            In progress
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="block h-2.5 w-4 rounded-[3px] bg-[rgba(21,128,61,0.92)]" />
            Completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="block h-2.5 w-4 rounded-[3px] bg-[rgba(239,68,68,0.9)]" />
            Overdue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="block h-2.5 w-4 rounded-[3px]"
              style={{ outline: "2px solid rgba(15,23,42,0.5)", outlineOffset: 1 }}
            />
            Deadline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="relative block h-2.5 w-4">
              <span className="absolute -bottom-[2px] -top-[2px] right-0 w-[2px] bg-[var(--color-warning)]" />
            </span>
            Deadline moved
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="block h-3 w-4 border-l border-dashed border-[rgba(15,23,42,0.45)]" />
            Today
          </span>
        </div>
        <span className="ml-auto">
          One box = one day, centred under its number. Scroll or drag to pan; hover any box for
          details.
        </span>
      </div>
    </div>
  );
}

// Memoized so hover moves never re-render the ~365-column tracks.
const HeatRow = memo(function HeatRow({ row, totalDays }: { row: HeatRowData; totalDays: number }) {
  return (
    <div className="flex border-t border-[rgba(148,163,184,0.08)]" data-row-id={row.id}>
      <div
        className="sticky left-0 z-10 flex flex-none items-center gap-1.5 overflow-hidden border-r border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] px-2 text-[0.75rem] text-[var(--color-ink-muted)]"
        style={{ width: `${TITLE_COL}px`, height: `${ROW_H}px` }}
        title={row.title}
      >
        <span className="block size-2 flex-none rounded-[50%]" style={{ background: row.dot }} />
        <span className="truncate">{row.title}</span>
      </div>
      <div
        className="grid"
        style={{
          width: `${totalDays * DAY_WIDTH}px`,
          gridTemplateColumns: `repeat(${totalDays}, ${DAY_WIDTH}px)`,
          height: `${ROW_H}px`,
          alignItems: "center",
        }}
      >
        {row.cells.map((c) => (
          <div
            key={c.col}
            data-col={c.col}
            className={`relative rounded-[5px] ${HEAT_CLASS[c.state]}`}
            style={{
              gridColumn: c.col + 1,
              height: `${CELL_H}px`,
              marginLeft: 6,
              marginRight: 6,
              ...(c.due ? { outline: "2px solid rgba(15,23,42,0.5)", outlineOffset: 1 } : {}),
            }}
          >
            {c.moved && (
              <span className="absolute -bottom-[3px] -top-[3px] right-0 w-[2px] bg-[var(--color-warning)]" />
            )}
            {c.finished && (
              <span className="absolute inset-0 grid place-items-center text-[13px] font-bold leading-none text-white">
                ✓
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

// Hover popover for a heatmap cell: task, weekday/date, state, plus
// deadline / old-deadline / finished markers.
function CellTooltip({
  row,
  cell,
  x,
  y,
}: {
  row: HeatRowData;
  cell: HeatCell;
  x: number;
  y: number;
}) {
  const day = new Date(cell.ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <motion.div
      // Opacity only. Left/top stay a plain style write: they follow the cursor
      // every mousemove, and interpolating toward a moving target is how a
      // tooltip starts lagging the pointer. Nothing here reads `window` for an
      // `initial` value either — the tooltip only exists client-side after a
      // hover, and keeping it that way is what avoids a hydration mismatch.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={snap(DUR.fast)}
      className="pointer-events-none fixed z-50 rounded-[10px] bg-[var(--color-ink)] px-3 py-2 text-[0.72rem] text-[#f8fafc] shadow-[0_8px_24px_-8px_rgba(15,23,42,0.45)]"
      style={{ left: Math.min(x + 14, window.innerWidth - 240), top: y + 16 }}
    >
      <div className="font-semibold">{row.title}</div>
      <div className="text-[#cbd5e1]">
        {day} — {HEAT_WORD[cell.state]}
        {cell.flags}
      </div>
    </motion.div>
  );
}

function totalTasks(t: Analytics["totals"]): number {
  return t.open + t.in_progress + t.completed + t.canceled;
}

function pct(t: Analytics["totals"]): number {
  const total = totalTasks(t);
  return total > 0 ? Math.round((t.completed / total) * 100) : 0;
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

function ChartTooltip({
  active,
  payload,
  label,
  visible,
  series,
}: {
  active?: boolean;
  // Recharts v3 hands us a readonly array of entries whose `payload`
  // field is the original data point. We only need that one field, so
  // a minimal-permissive type avoids a fight with recharts' full type.
  payload?: readonly { payload?: unknown }[];
  label?: string | number;
  visible: Set<SeriesKey>;
  series: AnalyticsSeriesItem[];
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) return null;
  // Recharts hands the hovered datapoint back as `unknown`, so this assertion is
  // the library's, not ours: the object is the row we passed to LineChart data.
  const data = payload[0].payload as AnalyticsSeriesItem;
  // Look up the previous day in the series so we can show today's delta.
  // No "previous" on the leftmost point — its total is the cumulative
  // baseline up to the start of the visible window, not "all happened today".
  const idx = series.findIndex((s) => s.date === data.date);
  const prev = idx > 0 ? series[idx - 1] : null;
  const rows = SERIES.filter((s) => visible.has(s.key)).map((s) => ({
    label: s.label,
    color: s.color,
    total: data[s.key],
    delta: prev ? data[s.key] - prev[s.key] : 0,
  }));
  return (
    <div className="rounded-[10px] bg-[var(--color-ink)] px-3 py-2 text-[0.72rem] text-[#f8fafc] shadow-[0_8px_24px_-8px_rgba(15,23,42,0.45)]">
      <div className="mb-1 text-[0.73rem] font-semibold">{label ? fmtDate(String(label)) : ""}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-1.5">
          <span className="block size-1.5 rounded-[50%]" style={{ background: r.color }} />
          {r.label}
          <span className="ml-auto pl-3.5 font-semibold">
            {r.total}
            {r.delta > 0 && <span className="ml-1 text-[#cbd5e1]">· +{r.delta} today</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// cn lives in lib/cn.ts (clsx + tailwind-merge) — this page carried a local
// copy that only did the clsx half of the job.
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
