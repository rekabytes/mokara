"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api, isApiError, type Analytics, type TeamWithRole } from "@/lib/api";

// PRD-04 phase 3 — team activity chart. Lines plot the 7-day rolling
// average per series (curves continuously, no horizontal plateaus); raw
// daily counts live in the hover tooltip.

type SeriesKey = "created" | "in_progress" | "completed" | "canceled";

const SERIES: { key: SeriesKey; label: string; color: string; token: string }[] = [
  { key: "created", label: "Created", color: "#0ea5e9", token: "var(--color-created)" },
  { key: "in_progress", label: "In progress", color: "#a16207", token: "var(--color-warning)" },
  { key: "completed", label: "Completed", color: "#6366f1", token: "var(--color-accent)" },
  { key: "canceled", label: "Canceled", color: "#ef4444", token: "var(--color-danger)" },
];

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

function timeOfDayGreeting(): string {
  return "Analytics";
}

export default function AnalyticsPage() {
  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Set<SeriesKey>>(
    new Set(["created", "in_progress", "completed", "canceled"])
  );

  // Load teams once; preselect the first so the chart has somewhere to point.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.listTeams();
        if (!alive) return;
        setTeams(res.teams);
        if (res.teams[0]) setTeamId(res.teams[0].id);
      } catch (e) {
        if (alive) setError(isApiError(e) ? e.message : "Couldn't load teams");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const a = await api.getAnalytics(teamId, range);
      setData(a);
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load analytics");
    } finally {
      setLoading(false);
    }
  }, [teamId, range]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(k: SeriesKey) {
    setVisible((v) => {
      const next = new Set(v);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const visibleSeries = useMemo(() => SERIES.filter((s) => visible.has(s.key)), [visible]);
  const teamName = teams.find((t) => t.id === teamId)?.name ?? "—";

  return (
    <div className="mx-auto max-w-[1060px] px-8 py-8 max-[800px]:px-4 max-[800px]:py-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] tracking-[-0.015em] m-0">{timeOfDayGreeting()}</h1>
          <p className="mt-1 text-[0.82rem] text-[var(--color-ink-muted)]">
            How work flows through <b>{teamName}</b> — created, started, finished, canceled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {teams.length > 1 && (
            <select
              value={teamId ?? ""}
              onChange={(e) => setTeamId(e.target.value)}
              className="cursor-pointer rounded-[999px] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] px-3 py-1.5 text-[0.78rem] font-medium text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <div className="inline-flex gap-1 rounded-[999px] border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] p-1">
            {([7, 30, 90] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "cursor-pointer rounded-[999px] px-3 py-0.5 text-[0.75rem] font-medium transition-colors",
                  range === r
                    ? "bg-[var(--color-surface-solid)] text-[var(--color-ink)] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                    : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                )}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress card */}
      {data && (
        <section className="mb-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
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
                  {on && (
                    <svg
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
                    </svg>
                  )}
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
              {error}
              <button
                type="button"
                onClick={load}
                className="ml-2 cursor-pointer text-[var(--color-accent)] underline"
              >
                Retry
              </button>
            </div>
          ) : data && data.series.length === 0 ? (
            <div className="grid h-full place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
              No activity in this window yet.
            </div>
          ) : data && visibleSeries.length === 0 ? (
            <div className="grid h-full place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
              Tick a series to compare.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data?.series ?? []}
                margin={{ top: 12, right: 12, bottom: 4, left: 4 }}
              >
                <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                  interval="preserveStartEnd"
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
                  content={<ChartTooltip visible={visible} />}
                  cursor={{ stroke: "rgba(15,23,42,0.22)", strokeWidth: 1, strokeDasharray: "3 3" }}
                />
                {SERIES.map((s) => (
                  <Line
                    key={s.key}
                    dataKey={`${s.key}_avg`}
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
          Smooth trend (7-day rolling average). Hover any day for the raw count + average.
        </p>
      </section>
    </div>
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

type TooltipPayload = {
  payload?: { date: string } & Record<string, number>;
  dataKey?: string;
  value?: number;
  color?: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  visible,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  visible: Set<SeriesKey>;
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) return null;
  const data = payload[0].payload;
  const rows = SERIES.filter((s) => visible.has(s.key)).map((s) => ({
    label: s.label,
    color: s.color,
    raw: data[s.key] as number,
    avg: data[`${s.key}_avg`] as number,
  }));
  return (
    <div className="rounded-[10px] bg-[var(--color-ink)] px-3 py-2 text-[0.72rem] text-[#f8fafc] shadow-[0_8px_24px_-8px_rgba(15,23,42,0.45)]">
      <div className="mb-1 text-[0.73rem] font-semibold">{label ? fmtDate(label) : ""}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-1.5">
          <span className="block size-1.5 rounded-[50%]" style={{ background: r.color }} />
          {r.label}
          <span className="ml-auto pl-3.5 font-semibold">
            {r.raw}
            <span className="ml-1 text-[#cbd5e1]">· avg {r.avg}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// cn helper must be imported to support compact sibling classes above.
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
