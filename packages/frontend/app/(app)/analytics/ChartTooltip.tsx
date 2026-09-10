"use client";

import { SERIES, fmtDate, type SeriesKey } from "./analytics-model";
import { type AnalyticsSeriesItem } from "@/lib/api";
// The line chart's tooltip. Rendered by recharts, so its props are the library's
// own (`active` / `payload` / `label`) plus the two the page threads in: the set
// of currently-visible series and the series rows themselves.
//
// This module and `page.tsx` are the ONLY two that touch recharts types, which
// is the point of keeping it separate: the permissive `readonly { payload?:
// unknown }[]` shape and the single commented assertion on the hovered datapoint
// are the library's, not ours, and they stay quarantined here.

export function ChartTooltip({
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
