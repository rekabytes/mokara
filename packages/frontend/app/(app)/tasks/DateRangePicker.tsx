"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type DateRange = { start: string | null; end: string | null };

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIso(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMonthYear(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function buildMonthGrid(monthDate: Date): (Date | null)[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  // Monday-first weekday (0 = Mon, 6 = Sun)
  const firstDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function DateRangePicker({
  value,
  onChange,
  trigger,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  trigger: (open: boolean, summary: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [baseMonth, setBaseMonth] = useState(() => {
    const d = fromIso(value.start) ?? fromIso(value.end) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const placeBelow = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left });
  };

  useEffect(() => {
    if (!open) return;
    placeBelow();
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest("[data-date-range-menu]")) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => placeBelow();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const summary = useMemo(() => {
    if (value.start && value.end) {
      const s = fromIso(value.start)!;
      const e = fromIso(value.end)!;
      if (isSameDay(s, e)) return formatShort(s);
      return `${formatShort(s)} → ${formatShort(e)}`;
    }
    if (value.start) return `${formatShort(fromIso(value.start)!)} → …`;
    if (value.end) return `… → ${formatShort(fromIso(value.end)!)}`;
    return "Due date";
  }, [value]);

  const start = fromIso(value.start);
  const end = fromIso(value.end);
  const today = startOfDay(new Date());
  const preview = hover ? fromIso(hover) : null;
  const rangeStart = start ?? preview;
  const rangeEnd = end ?? preview;
  const orderedRange =
    rangeStart && rangeEnd && rangeStart <= rangeEnd
      ? { s: rangeStart, e: rangeEnd }
      : rangeEnd && rangeStart
        ? { s: rangeEnd, e: rangeStart }
        : null;

  function inRange(d: Date): boolean {
    if (!orderedRange) return false;
    const t = startOfDay(d).getTime();
    return t >= startOfDay(orderedRange.s).getTime() && t <= startOfDay(orderedRange.e).getTime();
  }

  function onPickDay(d: Date) {
    if (!value.start || (value.start && value.end)) {
      onChange({ start: toIso(d), end: null });
      return;
    }
    const s = fromIso(value.start)!;
    if (d < s) {
      onChange({ start: toIso(d), end: toIso(s) });
    } else {
      onChange({ start: toIso(s), end: toIso(d) });
    }
  }

  function setToday() {
    onChange({ start: toIso(today), end: toIso(today) });
  }

  function setNextWeek() {
    const start = today;
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    onChange({ start: toIso(start), end: toIso(end) });
  }

  function setNoDate() {
    onChange({ start: null, end: null });
  }

  const month1 = baseMonth;

  const panel =
    open && pos ? (
      <div
        data-date-range-menu
        role="dialog"
        aria-label="Pick date range"
        style={{ position: "fixed", top: pos.top, left: pos.left }}
        className="z-[60] w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--color-border-soft)] bg-white shadow-[var(--shadow-lift)]"
      >
        {/* Header: month navigation */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-3 py-2">
          <button
            type="button"
            onClick={() => setBaseMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
            className="grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <ChevronIcon direction="left" />
          </button>
          <div className="text-[0.82rem] font-semibold text-[var(--color-ink)]">
            {formatMonthYear(month1)}
          </div>
          <button
            type="button"
            onClick={() => setBaseMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
            className="grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>

        {/* Single month */}
        <div className="px-3 pt-2">
          <MonthGrid
            monthDate={month1}
            today={today}
            rangeStart={orderedRange?.s ?? null}
            rangeEnd={orderedRange?.e ?? null}
            selectedStart={start}
            selectedEnd={end}
            preview={preview}
            onHoverDate={(iso) => setHover(iso)}
            onPickDay={onPickDay}
            inRange={inRange}
          />
        </div>

        {/* Footer: presets + actions */}
        <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] px-3 py-2">
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={setNoDate} className={footerBtn}>
              No date
            </button>
            <button type="button" onClick={setToday} className={footerBtn}>
              Today
            </button>
            <button type="button" onClick={setNextWeek} className={footerBtn}>
              +7 days
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={!value.start || !value.end}
            className={cn(
              "rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[0.78rem] font-semibold text-white",
              (!value.start || !value.end) && "cursor-not-allowed opacity-45"
            )}
          >
            Apply
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) placeBelow();
          setOpen((o) => !o);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="cursor-pointer"
      >
        {trigger(open, summary)}
      </button>
      {typeof document !== "undefined" && panel && createPortal(panel, document.body)}
    </>
  );
}

const footerBtn =
  "rounded-md px-2 py-1 text-[0.78rem] font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]";

function MonthGrid({
  monthDate,
  today,
  rangeStart,
  rangeEnd,
  selectedStart,
  selectedEnd,
  preview,
  onHoverDate,
  onPickDay,
  inRange,
}: {
  monthDate: Date;
  today: Date;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  selectedStart: Date | null;
  selectedEnd: Date | null;
  preview: Date | null;
  onHoverDate: (iso: string | null) => void;
  onPickDay: (d: Date) => void;
  inRange: (d: Date) => boolean;
}) {
  const cells = buildMonthGrid(monthDate);
  const previewRange =
    preview && rangeStart && !rangeEnd
      ? preview < rangeStart
        ? { s: preview, e: rangeStart }
        : { s: rangeStart, e: preview }
      : null;
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-0 text-center text-[0.68rem] font-semibold tracking-[0.04em] text-[var(--color-ink-faint)] uppercase">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="px-1 py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="h-8" />;
          const iso = toIso(d);
          const isToday = isSameDay(d, today);
          const isStart = selectedStart && isSameDay(d, selectedStart);
          const isEnd = selectedEnd && isSameDay(d, selectedEnd);
          const isRange = inRange(d);
          const isPreview = previewRange && d >= previewRange.s && d <= previewRange.e;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPickDay(d)}
              onMouseEnter={() => onHoverDate(iso)}
              onMouseLeave={() => onHoverDate(null)}
              className={cn(
                "relative h-8 cursor-pointer text-[0.78rem] transition-colors duration-[120ms]",
                (isStart || isEnd) &&
                  "rounded-full bg-[var(--color-accent)] font-semibold text-white",
                isRange &&
                  !(isStart || isEnd) &&
                  "bg-[var(--color-accent-soft)] text-[var(--color-ink)]",
                isPreview &&
                  !(isStart || isEnd || isRange) &&
                  "bg-[var(--color-accent-soft)] text-[var(--color-ink)]",
                !isRange &&
                  !isStart &&
                  !isEnd &&
                  !isPreview &&
                  "hover:bg-[var(--color-surface-2)] text-[var(--color-ink)]",
                isToday && !(isStart || isEnd) && "font-semibold text-[var(--color-accent)]"
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
