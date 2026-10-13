import { LIST_VISIBLE_ROWS } from "./analytics-model";
import type { useAnalyticsData } from "./use-analytics-data";

type Props = Pick<
  ReturnType<typeof useAnalyticsData>,
  "kpiProgress" | "kpiLoading" | "kpiError" | "loadKpiProgress"
>;

export function KpiProgressCard({ kpiProgress, kpiLoading, kpiError, loadKpiProgress }: Props) {
  return (
    <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.8rem] font-semibold">
          KPI progress{" "}
          <span className="font-normal text-[var(--color-ink-faint)]">
            · {kpiProgress?.length ?? 0} KPIs
          </span>
        </span>
        <span className="text-[0.7rem] text-[var(--color-ink-faint)]">
          Σ(weight × status) ÷ Σ(weight) · canceled excluded
        </span>
      </div>
      {kpiLoading && !kpiProgress ? (
        <div className="grid h-[80px] place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
          Loading…
        </div>
      ) : kpiError ? (
        <div className="grid h-[80px] place-items-center text-[0.8rem] text-[var(--color-ink-faint)]">
          {kpiError.message}
          <button
            type="button"
            onClick={loadKpiProgress}
            className="ml-2 cursor-pointer text-[var(--color-accent)] underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="relative">
          {/* PRD-09: 7 KPIs visible, the rest behind the card's own
                vertical scrollbar — same cap as the heatmap above. */}
          <ul className="m-0 flex max-h-[252px] list-none flex-col gap-0.5 overflow-y-auto p-0">
            {(kpiProgress ?? []).map((k) => (
              <li
                key={k.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2 min-[1100px]:flex"
              >
                <span className="min-w-0 min-[1100px]:w-[180px] shrink-0 truncate text-[0.8rem] font-medium text-[var(--color-ink)]">
                  {k.name}
                </span>
                <span className="pill row-start-2 max-w-[140px] truncate justify-self-start shrink-0">
                  {k.owner_username}
                </span>
                <span className="col-span-full row-start-3 flex h-2 min-w-0 flex-1 overflow-hidden rounded-[999px] bg-[rgba(148,163,184,0.18)]">
                  <span
                    className="h-full rounded-[999px] bg-[var(--color-accent)] transition-[width] duration-300"
                    style={{ width: `${k.progress}%` }}
                  />
                </span>
                <span className="col-start-2 row-start-1 w-[42px] shrink-0 text-right font-mono text-[0.76rem] text-[var(--color-ink)]">
                  {k.progress}%
                </span>
                <span className="col-start-2 row-start-2 min-[1100px]:w-[92px] shrink-0 text-right text-[0.72rem] text-[var(--color-ink-faint)]">
                  {k.task_count} tied · Σ{k.weight_sum}
                </span>
              </li>
            ))}
            {(kpiProgress ?? []).length === 0 && (
              <li className="py-2 text-[0.78rem] text-[var(--color-ink-faint)]">
                No KPIs in this container yet — create them on the team page, then weight tasks
                toward them from the task drawer.
              </li>
            )}
          </ul>
          {kpiProgress !== null && kpiProgress.length > LIST_VISIBLE_ROWS && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
              <span className="rounded-[999px] bg-[var(--color-surface-solid)]/90 px-3 py-1 text-[0.72rem] text-[var(--color-ink-faint)] shadow-[var(--shadow-card)]">
                {kpiProgress.length - LIST_VISIBLE_ROWS} more KPIs below
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
