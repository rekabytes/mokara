"use client";

// The slim breadcrumb bar every app page renders. It used to be copied
// verbatim into four pages (tasks, analytics, settings, team detail); one
// module now holds the single copy so they cannot drift. The label is
// `children` so each page still writes its own title as JSX text.
//
// The Star button is a DEAD CONTROL on purpose: it renders with no handler and
// must not be pointed at by the tour, or wired up, without an owner decision.
// The bell is `size-8`, and that is what sets the row height.
import { NotificationBell } from "@/components/NotificationBell";
import { StarIcon } from "./Icons";

export function PageHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] py-1">
      <div className="flex items-center gap-[0.4rem] text-[0.92rem] font-semibold">
        <span className="text-[var(--color-ink-muted)]">Mokara</span>
        <span className="text-[var(--color-ink-faint)]">›</span>
        <span>{children}</span>
        <button
          type="button"
          aria-label="Star"
          className="ml-1 grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-muted)]"
        >
          <StarIcon />
        </button>
      </div>
      <NotificationBell />
    </div>
  );
}
