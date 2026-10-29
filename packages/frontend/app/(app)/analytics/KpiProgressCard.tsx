import { ChevronDownIcon } from "@/components/Icons";
import "./kpi-progress.css";
import { LIST_VISIBLE_ROWS } from "./analytics-model";
import type { useAnalyticsData } from "./use-analytics-data";

type Props = Pick<
  ReturnType<typeof useAnalyticsData>,
  "kpiProgress" | "kpiLoading" | "kpiError" | "loadKpiProgress"
>;

export function KpiProgressCard({ kpiProgress, kpiLoading, kpiError, loadKpiProgress }: Props) {
  return (
    <section className="task-kpi-panel" aria-label="Task-based KPIs">
      <div className="task-kpi-header">
        <div>
          <h2>
            Task-based KPI progress <span>{kpiProgress?.length ?? 0}</span>
          </h2>
          <p>Progress from the work linked to each KPI.</p>
        </div>
        <details className="task-kpi-help">
          <summary>
            How weights work <ChevronDownIcon />
          </summary>
          <p>
            Completed tasks earn full credit. In-progress tasks earn half credit. To-do tasks earn
            no credit, and canceled tasks are excluded. Each task contributes according to its
            assigned weight. A KPI with no linked tasks shows 0%.
          </p>
        </details>
      </div>
      {kpiLoading && !kpiProgress ? (
        <div className="grid h-[80px] place-items-center text-[0.8rem] text-[var(--color-ink-muted)]">
          Loading…
        </div>
      ) : kpiError ? (
        <div className="grid h-[80px] place-items-center text-[0.8rem] text-[var(--color-ink-muted)]">
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
          <ul className="task-kpi-rows">
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
                <span
                  className="col-span-full row-start-3 flex h-2 min-w-0 flex-1 overflow-hidden rounded-[999px] bg-[rgba(148,163,184,0.18)]"
                  role="progressbar"
                  aria-label={`${k.name} weighted task progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={k.progress}
                >
                  <span
                    className="h-full rounded-[999px] bg-[var(--color-accent)]"
                    style={{ width: `${k.progress}%` }}
                  />
                </span>
                <span className="col-start-2 row-start-1 w-[42px] shrink-0 text-right font-mono text-[0.76rem] text-[var(--color-ink)]">
                  {k.progress}%
                </span>
                <span className="col-start-2 row-start-2 min-[1100px]:w-[130px] shrink-0 text-right text-[0.72rem] text-[var(--color-ink-muted)]">
                  {k.task_count} tasks · {k.weight_sum} weight
                </span>
              </li>
            ))}
            {(kpiProgress ?? []).length === 0 && (
              <li className="py-2 text-[0.78rem] text-[var(--color-ink-muted)]">
                No task-based KPIs yet. Create one on the team page, then link and weight tasks from
                their task details.
              </li>
            )}
          </ul>
          {kpiProgress !== null && kpiProgress.length > LIST_VISIBLE_ROWS && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
              <span className="rounded-[999px] bg-[var(--color-surface-solid)]/90 px-3 py-1 text-[0.72rem] text-[var(--color-ink-muted)] shadow-[var(--shadow-card)]">
                {kpiProgress.length - LIST_VISIBLE_ROWS} more KPIs below
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
