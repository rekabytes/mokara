"use client";

import {
  AXIS_HEIGHT,
  DAY_MS,
  DAY_WIDTH,
  LIST_VISIBLE_ROWS,
  ROW_H,
  TITLE_COL,
  dayIdxOfYear,
  type HeatCell,
  type HeatRowData,
  type HeatState,
} from "./analytics-model";
import { CellTooltip, HeatRow } from "./HeatRow";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { type ProgressTask } from "@/lib/api";
// The progress heatmap track: one CSS-grid row per task, one cell per day, with
// the sticky title column, the month axis, the hover tooltip and the two
// stand-in scroll thumbs.
//
// `scrollRef` is OWNED BY THE PAGE and passed in, because the page's
// "Jump to month" control has to scroll this track from an event handler; both
// sides do the month maths with the same `monthStartPx` helper from
// ./analytics-model, so they cannot drift.
//
// PRD-09: the native scrollbars are hidden and the thumbs fade in on card hover
// — that fade is pure CSS `group-hover`, no JS in the animation. The row and the
// cells are NEVER motion nodes: a 365-column track re-renders often enough that
// projecting layout on it is the one place this app opts out of framer-motion.

export function ProgressGantt({
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
  const hThumbRef = useRef<HTMLDivElement | null>(null);
  const vThumbRef = useRef<HTMLDivElement | null>(null);

  // PRD-09: the native scrollbars are hidden; these thumbs stand in for them
  // and fade in while the card is hovered (the fade is pure CSS group-hover —
  // no JS in the animation). Thumb math is 1:1: within a track as wide as the
  // visible area, a thumb sized to the visible fraction moves exactly
  // scrollLeft px, so position and size come straight off the live values.
  const syncIndicators = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (hThumbRef.current) {
      hThumbRef.current.style.width = `${(el.clientWidth / el.scrollWidth) * el.clientWidth}px`;
      hThumbRef.current.style.transform = `translateX(${el.scrollLeft}px)`;
    }
    if (vThumbRef.current) {
      vThumbRef.current.style.height = `${(el.clientHeight / el.scrollHeight) * el.clientHeight}px`;
      vThumbRef.current.style.transform = `translateY(${el.scrollTop}px)`;
    }
  }, [scrollRef]);

  // Size the thumbs when the first layout exists and whenever a payload
  // changes the scroll extents; every scroll afterwards keeps them live via
  // onScroll. Outside-React DOM sync — the documented allowed effect.
  useEffect(() => {
    if (tasks.length === 0) return;
    syncIndicators();
  }, [tasks, syncIndicators]);
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
  // Weekend columns + today, tinted once behind all rows (not per row).
  // A column can carry TWO layers: the grey weekend wash and, painted over it,
  // the indigo today marker — which is why identity is (column, layer) and not
  // the column alone. Keying on `col` alone collided the first time "today"
  // landed on a weekend (2026-09-05, column 247) and React warned about it.
  const tints: { col: number; layer: "weekend" | "today" }[] = [];
  for (let idx = 0; idx < totalDays; idx++) {
    const dow = new Date(startMs + idx * DAY_MS).getUTCDay();
    if (dow === 0 || dow === 6) tints.push({ col: idx, layer: "weekend" });
  }
  tints.push({ col: todayIdx, layer: "today" });

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
    <div className="group relative min-w-0">
      <div
        ref={scrollRef}
        // Native scrollbars off (both axes) — the hover-fading thumbs below
        // are the only scroll affordance. The capped body keeps the page from
        // stretching with the task count (PRD-09); the axis row pins to the
        // top and task titles stay pinned left.
        className={`relative overflow-auto min-w-0 max-w-full rounded-[6px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          dragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
        style={{ maxHeight: AXIS_HEIGHT + LIST_VISIBLE_ROWS * ROW_H }}
        onScroll={syncIndicators}
        onMouseDown={onMouseDown}
      >
        <div style={{ width: `${TITLE_COL + trackWidth}px` }}>
          {/* Axis row: pins to the top of the capped scroller (PRD-09); its
              blank corner is already sticky-left, so it pins both ways. */}
          <div className="sticky top-0 z-20 flex bg-[var(--color-surface-solid)]">
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
                  key={`${t.col}:${t.layer}`}
                  className="absolute inset-y-0"
                  style={{
                    left: `${t.col * DAY_WIDTH}px`,
                    width: `${DAY_WIDTH}px`,
                    background:
                      t.layer === "today" ? "rgba(99,102,241,0.06)" : "rgba(15,23,42,0.028)",
                  }}
                >
                  {t.layer === "today" && (
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

      {/* PRD-09: overflow affordance — only while the payload exceeds the
          cap. Static (no scroll listeners); pointer-events-none so cell hover
          and drag-scroll pass through. */}
      {tasks.length > LIST_VISIBLE_ROWS && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="rounded-[999px] bg-[var(--color-surface-solid)]/90 px-3 py-1 text-[0.72rem] text-[var(--color-ink-faint)] shadow-[var(--shadow-card)]">
            {tasks.length - LIST_VISIBLE_ROWS} more tasks below
          </span>
        </div>
      )}

      {/* Hover-revealed scroll thumbs — see syncIndicators above. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-1 z-30 h-1 opacity-0 transition-opacity duration-200 ease-[var(--ease-snap)] group-hover:opacity-100">
        <div ref={hThumbRef} className="h-full rounded-[999px] bg-[rgba(15,23,42,0.22)]" />
      </div>
      {tasks.length > LIST_VISIBLE_ROWS && (
        <div className="pointer-events-none absolute bottom-1 right-1 top-1 z-30 w-1 opacity-0 transition-opacity duration-200 ease-[var(--ease-snap)] group-hover:opacity-100">
          <div ref={vThumbRef} className="w-full rounded-[999px] bg-[rgba(15,23,42,0.22)]" />
        </div>
      )}

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
