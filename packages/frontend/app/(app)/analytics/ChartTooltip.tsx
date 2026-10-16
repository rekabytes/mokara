"use client";

import { SERIES, fmtDate, type SeriesKey } from "./analytics-model";
import { type AnalyticsSeriesItem } from "@/lib/api";
// The line chart's tooltip. Rendered by recharts, so its props are the library's
// own (`active` / `payload` / `label`) plus the two the page threads in: the set
// of currently-visible series and the series rows themselves.
//
// Read values from our validated series, using only the payload date to identify
// the hovered row. Unknown/malformed library payloads do not bypass type safety.

export function ChartTooltip({
  active,
  payload,
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
  const candidate = payload[0].payload;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("date" in candidate) ||
    typeof candidate.date !== "string"
  )
    return null;
  const data = series.find((row) => row.date === candidate.date);
  if (!data) return null;
  // Look up the previous displayed day to show new events on the hovered day.
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
    <div className="max-w-[calc(100vw-3rem)] rounded-[10px] bg-[var(--color-ink)] px-3 py-2 text-[0.72rem] text-[#f8fafc] shadow-[0_8px_24px_-8px_rgba(15,23,42,0.45)]">
      <div className="mb-1 text-[0.73rem] font-semibold">{fmtDate(data.date)}</div>
      <p className="mb-1 mt-0 text-[#cbd5e1]">Cumulative events</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-1.5">
          <span className="block size-1.5 shrink-0 rounded-[50%]" style={{ background: r.color }} />
          <span className="min-w-0 flex-1">{r.label}</span>
          <span className="ml-auto shrink-0 pl-3.5 text-right font-semibold">
            {r.total}
            {r.delta > 0 && (
              <span className="block font-normal text-[#cbd5e1]">+{r.delta} on this day</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
