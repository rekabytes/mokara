"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// Single-date picker used for a task's due date. There is deliberately no
// start date: when work actually begins is derived from the task's first
// todo -> in_progress transition (see GET /teams/:id/analytics progress).

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
  // Accept both "YYYY-MM-DD" and a full RFC3339 timestamp (what the API
  // returns for due_date) — only the date part matters here.
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
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

export function DatePicker({
  value,
  onChange,
  trigger,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  trigger: (open: boolean, summary: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [baseMonth, setBaseMonth] = useState(() => {
    const d = fromIso(value) ?? new Date();
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
      if ((t as HTMLElement).closest("[data-date-menu]")) return;
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

  const selected = fromIso(value);
  const today = startOfDay(new Date());
  const summary = selected ? formatShort(selected) : "Due date";

  // One click commits and dismisses — there is nothing else to pick.
  function pick(d: Date) {
    onChange(toIso(d));
    setOpen(false);
  }

  const panel =
    open && pos ? (
      <div
        data-date-menu
        role="dialog"
        aria-label="Pick due date"
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
            {formatMonthYear(baseMonth)}
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
        <div className="px-3 pt-2 pb-1">
          <div className="mb-1 grid grid-cols-7 gap-0 text-center text-[0.68rem] font-semibold tracking-[0.04em] text-[var(--color-ink-faint)] uppercase">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="px-1 py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0">
            {buildMonthGrid(baseMonth).map((d, i) => {
              if (!d) return <div key={i} className="h-8" />;
              const isSelected = !!selected && isSameDay(d, selected);
              const isToday = isSameDay(d, today);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  className={cn(
                    "relative h-8 cursor-pointer text-[0.78rem] transition-colors duration-[120ms]",
                    isSelected && "rounded-full bg-[var(--color-accent)] font-semibold text-white",
                    !isSelected && "hover:bg-[var(--color-accent-soft)] text-[var(--color-ink)]",
                    isToday && !isSelected && "font-semibold text-[var(--color-accent)]"
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer: presets */}
        <div className="flex items-center gap-0.5 border-t border-[var(--color-border-soft)] px-3 py-2">
          <button type="button" onClick={() => pick(today)} className={footerBtn}>
            Today
          </button>
          <button
            type="button"
            onClick={() => pick(new Date(today.getTime() + 7 * 86400000))}
            className={footerBtn}
          >
            +7 days
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(footerBtn, "ml-auto")}
          >
            No date
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
