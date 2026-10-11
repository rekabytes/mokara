"use client";

import { useRef } from "react";
import { MONTH_NAMES, monthStartPx } from "./analytics-model";
import { ProgressGantt } from "./ProgressGantt";
import type { useAnalyticsData } from "./use-analytics-data";

type Props = Pick<
  ReturnType<typeof useAnalyticsData>,
  "progress" | "progressLoading" | "progressError" | "loadProgress"
>;

export function TaskProgressCard({
  progress,
  progressLoading,
  progressError,
  loadProgress,
}: Props) {
  // The dropdown scrolls the external DOM directly; no effect or mirrored state.
  const ganttScrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.8rem] font-semibold">
          Progress{" "}
          <span className="font-normal text-[var(--color-ink-faint)]">
            · {progress?.tasks.length ?? 0} tasks
          </span>
        </span>
        <select
          // Uncontrolled: the only thing this dropdown does is scroll a DOM
          // node, which it can do straight from onChange. It used to write a
          // `jumpMonth` state that an effect watched — state whose sole
          // purpose was to be noticed by an effect.
          defaultValue=""
          onChange={(e) => {
            const el = ganttScrollRef.current;
            if (!el) return;
            const month = e.target.value;
            if (month === "") return;
            el.scrollLeft = Math.max(0, monthStartPx(new Date().getFullYear(), Number(month)));
          }}
          aria-label="Jump to month"
          className="cursor-pointer rounded-[999px] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] px-3 py-1.5 text-[0.78rem] font-medium text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
        >
          <option value="" disabled>
            Jump to month…
          </option>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {progressLoading && !progress ? (
        <div className="grid h-[120px] place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
          Loading…
        </div>
      ) : progressError ? (
        <div className="grid h-[120px] place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
          {progressError.message}
          <button
            type="button"
            onClick={loadProgress}
            className="ml-2 cursor-pointer text-[var(--color-accent)] underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <ProgressGantt tasks={progress?.tasks ?? []} scrollRef={ganttScrollRef} />
      )}
    </section>
  );
}
