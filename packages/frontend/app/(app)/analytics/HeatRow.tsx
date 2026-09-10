"use client";

import {
  CELL_H,
  DAY_WIDTH,
  HEAT_CLASS,
  HEAT_WORD,
  ROW_H,
  TITLE_COL,
  type HeatCell,
  type HeatRowData,
} from "./analytics-model";
import { DUR, snap } from "@/lib/motion";
import { motion } from "framer-motion";
import { memo } from "react";
// One heatmap row (`HeatRow`, memoised) and the hover tooltip it feeds
// (`CellTooltip`).
//
// `HeatRow` is wrapped in `memo` because the track holds up to a year of columns
// per row and re-renders on every hover: without it, moving the pointer across
// one cell re-renders every row. Memoisation is also why the row takes plain
// data (`HeatRowData`) rather than a task object.
//
// Neither the row nor its cells is a motion node, and the tooltip is positioned
// from the hover coordinates the track already measured — this is the one
// surface where the house rule "motion stops at the heatmap tooltip" applies.

// Memoized so hover moves never re-render the ~365-column tracks.
export const HeatRow = memo(function HeatRow({
  row,
  totalDays,
}: {
  row: HeatRowData;
  totalDays: number;
}) {
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
              <span className="absolute inset-0 grid place-items-center text-white">
                {/* SVG, not the ✓ glyph — the UI stays emoji/glyph-free; the
                    thicker stroke keeps the tick legible at 12px on the chip. */}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
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
export function CellTooltip({
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
