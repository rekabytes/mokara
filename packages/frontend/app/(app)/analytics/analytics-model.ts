// Analytics model: the trailing-window constants, the series definitions, the
// date helpers, the heatmap geometry and its state→class/word tables, and the
// two totals helpers.
//
// Pure data and pure functions — no React, no DOM — so the calendar maths can be
// asserted directly. Two rules live here:
//   - `WINDOW_DAYS` is the chart's fixed trailing window (the range control was
//     removed by owner decision; the chart is always the last 14 days).
//   - the heatmap anchors day maths on LOCAL midnight, while the series buckets
//     come from the server. Two "today"s knowingly coexist; do not "unify" them.
//
// `LIST_VISIBLE_ROWS` and the `DAY_WIDTH`/`TITLE_COL`/`ROW_H`/`CELL_H` geometry
// are shared by the page and `ProgressGantt`, which is why they live in a module
// neither of them owns — that is what keeps the split cycle-free.

import type { Analytics } from "@/lib/api";

import { type AnalyticsSeriesItem } from "@/lib/api";

export type SeriesKey = keyof Omit<AnalyticsSeriesItem, "date">;

export const WINDOW_DAYS = 14;

// PRD-09: both capped lists (heatmap rows, KPI rows) show this many entries
// before their internal vertical scroll takes over. The payloads are already
// complete — the cap is a viewport, not a query.
export const LIST_VISIBLE_ROWS = 7;

// One YYYY-MM-DD per day of the window, oldest first, today last.
// Local date math throughout — round-tripping through toISOString()
// shifts the day back in +UTC timezones.
export function trailingDates(today: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1) + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  });
}

export const SERIES: { key: SeriesKey; label: string; color: string; token: string }[] = [
  { key: "created", label: "Created", color: "#0ea5e9", token: "var(--color-created)" },
  { key: "in_progress", label: "In progress", color: "#a16207", token: "var(--color-warning)" },
  { key: "completed", label: "Completed", color: "#6366f1", token: "var(--color-accent)" },
  { key: "canceled", label: "Canceled", color: "#ef4444", token: "var(--color-danger)" },
];

export const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: "short" })
);

export function fmtDate(iso: string): string {
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
export function dayIdxOfYear(year: number, d: Date): number {
  return Math.round((d.getTime() - new Date(year, 0, 1).getTime()) / DAY_MS);
}

export function monthStartPx(year: number, month: number): number {
  return dayIdxOfYear(year, new Date(year, month, 1)) * DAY_WIDTH;
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
export const DAY_MS = 86400000;

export const DAY_WIDTH = 60;

export const TITLE_COL = 160;

export const AXIS_HEIGHT = 44;

export const ROW_H = 38;

export const CELL_H = 26;

export type HeatState = "waiting" | "upcoming" | "active" | "done" | "late" | "ghost";

export const HEAT_CLASS: Record<HeatState, string> = {
  waiting: "bg-[rgba(148,163,184,0.13)] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.45)]",
  upcoming: "border border-dashed border-[rgba(148,163,184,0.5)]",
  active: "bg-[rgba(99,102,241,0.88)]",
  done: "bg-[rgba(21,128,61,0.92)]",
  late: "bg-[rgba(239,68,68,0.9)]",
  ghost: "",
};

export const HEAT_WORD: Record<HeatState, string> = {
  waiting: "Not started",
  upcoming: "Upcoming",
  active: "In progress",
  done: "Completed",
  late: "Overdue",
  ghost: "Deadline day",
};

export type HeatCell = {
  col: number; // 0-based day index in the year window (grid column - 1)
  ms: number; // UTC midnight of that day, for the tooltip date
  state: HeatState;
  due: boolean; // deadline day → dark ring
  moved: boolean; // an old deadline landed here → amber tick
  finished: boolean; // the day the task completed → check mark
  flags: string; // prebuilt tooltip suffix (" · deadline" …)
};

export type HeatRowData = { id: string; title: string; dot: string; cells: HeatCell[] };

export function totalTasks(t: Analytics["totals"]): number {
  return t.open + t.in_progress + t.completed + t.canceled;
}

export function pct(t: Analytics["totals"]): number {
  const total = totalTasks(t);
  return total > 0 ? Math.round((t.completed / total) * 100) : 0;
}
