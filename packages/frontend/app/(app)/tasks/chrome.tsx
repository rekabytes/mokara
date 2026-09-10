"use client";

import { MENU_GAP, PRIORITY_BAR_COLOR } from "./board-model";
import { type TaskPriority } from "@/lib/api";
import { cn } from "@/lib/cn";
import { popoverVariants, tickVariants } from "@/lib/motion";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
// Drawer/modal chrome for the tasks route: the popover primitive, the chip
// shells it hangs off, menu items, section labels and the two icon buttons.
//
// `Dropdown` is the one with rules attached. It measures its trigger and
// portals the menu to document.body, so:
//   - `AnimatePresence` wraps the `createPortal` CALL (not a child inside it),
//     because AnimatePresence owns unmount timing and re-renders the removed
//     child with its last props;
//   - the measured position is NEVER cleared on close, or the exit animation
//     collapses to the viewport origin;
//   - `placeBelow` depends on nothing, which is why `MENU_GAP` is module scope.
// `IconButton` deliberately takes NO onClick: the filter-row gear, funnel and
// layout buttons are dead controls and must stay dead (see .pi/memory.md).

// Three ascending bars — fill count encodes priority (1/2/3), color encodes
// level. Used as a small inline indicator alongside the priority label.
export function PriorityBars({ priority }: { priority: TaskPriority }) {
  const filled = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  const barColor = PRIORITY_BAR_COLOR[priority];
  return (
    <span
      className="inline-flex items-end gap-[2px] align-middle"
      role="img"
      aria-label={`Priority: ${priority}`}
    >
      <span
        className={cn(
          "w-[3px] rounded-[1px] h-[5px]",
          filled >= 1 ? barColor : "bg-[var(--color-border-soft)]"
        )}
      />
      <span
        className={cn(
          "w-[3px] rounded-[1px] h-[7px]",
          filled >= 2 ? barColor : "bg-[var(--color-border-soft)]"
        )}
      />
      <span
        className={cn(
          "w-[3px] rounded-[1px] h-[10px]",
          filled >= 3 ? barColor : "bg-[var(--color-border-soft)]"
        )}
      />
    </span>
  );
}

export function ChipShell({
  open = false,
  children,
}: {
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.78rem] font-medium transition-colors duration-[140ms]",
        open
          ? "border-[var(--color-border-strong)] bg-white text-[var(--color-ink)] shadow-[0_1px_3px_rgba(15,23,42,0.1)]"
          : "border-[var(--color-border-soft)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
      )}
    >
      {children}
    </span>
  );
}

// Renders children inside a grid cell that's sized by an invisible copy of
// the icon + longest label — so the chip width never shrinks below the
// widest option, including the icon width.
export function MinWidthChip({
  icon,
  longestLabel,
  children,
}: {
  icon: React.ReactNode;
  longestLabel: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-grid items-center">
      <span
        aria-hidden
        className="invisible pointer-events-none col-start-1 row-start-1 inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        {icon}
        <span>{longestLabel}</span>
      </span>
      <span className="col-start-1 row-start-1 inline-flex items-center gap-1.5 whitespace-nowrap">
        {children}
      </span>
    </span>
  );
}

export function Dropdown({
  trigger,
  children,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const placeBelow = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + MENU_GAP, left: r.left });
  }, []);

  // Outside-React sync — document/window listeners plus a rect measurement —
  // so this is one of the effects that legitimately stays. It only owns
  // "where is the trigger" and "who clicked elsewhere"; the menu's appearance
  // is framer-motion's problem, not a re-render's.
  useEffect(() => {
    if (!open) return;
    placeBelow();
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-dropdown-menu]")) return;
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
  }, [open, placeBelow]);

  // `pos` is left set when the menu closes: the exiting frame reuses the last
  // measurement, which is what keeps the fade from flashing at the top-left
  // corner. Nulling it here would move the element mid-exit.
  const menu =
    open && pos ? (
      <motion.div
        key="dropdown-menu"
        data-dropdown-menu
        role="listbox"
        variants={popoverVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        style={{ position: "fixed", top: pos.top, left: pos.left }}
        className="z-[60] overflow-hidden rounded-lg border border-[var(--color-border-soft)] bg-white py-1 whitespace-nowrap shadow-[var(--shadow-lift)]"
      >
        {children}
      </motion.div>
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
        aria-haspopup="listbox"
        aria-expanded={open}
        className="cursor-pointer"
      >
        {trigger(open)}
      </button>
      {/* AnimatePresence has to wrap the portal call itself: the menu is not a
          DOM descendant of this component, so no ancestor presence-check can
          see it unmount. */}
      {typeof document !== "undefined" &&
        createPortal(<AnimatePresence>{menu}</AnimatePresence>, document.body)}
    </>
  );
}

export function MenuItem({
  selected,
  icon,
  onClick,
  children,
}: {
  selected: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      // 2-column grid: column 1 is text (1fr), column 2 is a fixed 18px
      // slot reserved for the checkmark. Because every row always
      // accounts for the checkmark column, the menu container's width is
      // anchored to (longest text + checkmark) — selecting a shorter row
      // doesn't shrink the menu.
      //
      // Hover background: a simple background-color change with a smooth
      // transition. The checkmark is the only indicator for selected
      // rows; the indigo tint appears only on hover of unselected rows.
      // (Custom rgba used to dial the opacity lower than --color-accent-soft
      //  so it reads as a subtle hover hint, not a strong selection mark.)
      className={cn(
        "grid w-full cursor-pointer grid-cols-[1fr_18px] items-center gap-2 px-3 py-[0.4rem] text-left text-[0.82rem] transition-colors duration-200 ease-out",
        selected
          ? "text-[var(--color-ink)]"
          : "text-[var(--color-ink)] hover:bg-[rgba(99,102,241,0.06)]"
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span>{children}</span>
      </span>
      <span className="flex items-center justify-center">
        {/* The 18px checkmark column is reserved on every row (see the grid
            comment above), so the tick can scale in without shifting text. */}
        <AnimatePresence>
          {selected && (
            <motion.svg
              key="tick"
              variants={tickVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-[var(--color-accent)]"
            >
              <path
                d="M5 12.5l4.5 4.5L19 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-0.5 pt-2 text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-faint)]">
      {children}
    </div>
  );
}

export function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-7 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-muted)]"
    >
      {children}
    </button>
  );
}

export function SmallIconButton({
  label,
  onClick,
  children,
  danger,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-white",
        active &&
          "border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]",
        !active && danger && "hover:text-[var(--color-danger)]",
        !active && !danger && "hover:text-[var(--color-ink)]"
      )}
    >
      {children}
    </button>
  );
}
