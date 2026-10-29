import { ChevronDownIcon } from "@/components/Icons";
import { goalPeriod, goalState, goalValue, type KpiGoalPeriods } from "@/lib/kpi-goals";

export function KpiPeriodComparison({ periods }: { periods: KpiGoalPeriods }) {
  const columns = [
    ...(periods.previous ? [{ label: "Previous period", goal: periods.previous }] : []),
    { label: "Selected period", goal: periods.goal },
    ...(periods.next ? [{ label: "Next period", goal: periods.next }] : []),
  ];
  const previousProgress = periods.previous?.progress,
    selectedProgress = periods.goal.progress;
  const difference =
    typeof previousProgress === "number" && selectedProgress !== null
      ? Math.round((selectedProgress - previousProgress) * 100) / 100
      : null;
  const rows = [
    { label: "Starting value", value: (g: KpiGoalPeriods["goal"]) => goalValue(g, g.baseline) },
    {
      label: "Recorded result",
      value: (g: KpiGoalPeriods["goal"]) =>
        g.current_value === null ? "No result recorded" : goalValue(g, g.current_value),
    },
    { label: "Target", value: (g: KpiGoalPeriods["goal"]) => goalValue(g, g.target) },
    {
      label: "Target attainment",
      value: (g: KpiGoalPeriods["goal"]) => (g.progress === null ? "Unreported" : `${g.progress}%`),
    },
    {
      label: "Owner",
      value: (g: KpiGoalPeriods["goal"]) => (g.owner_id ? g.owner_name : "Unassigned"),
    },
    {
      label: "Latest observation",
      value: (g: KpiGoalPeriods["goal"]) => g.last_observed_on ?? "None",
    },
    { label: "State", value: (g: KpiGoalPeriods["goal"]) => goalState(g) },
  ];
  return (
    <>
      <p className="goal-help">Each period keeps its own target, dates and results.</p>
      <div className="goal-period-grid">
        {columns.map(({ label, goal }) => (
          <article
            key={goal.id}
            className={`goal-period-card${label === "Selected period" ? " is-selected" : ""}`}
            aria-label={`${label}: ${goal.name}`}
          >
            <span className="goal-period-label">{label}</span>
            <h4>{goal.name}</h4>
            <p className="goal-card-period">{goalPeriod(goal)}</p>
            <p className="goal-measurement-label">Recorded result</p>
            <p className="goal-period-result">
              {goal.current_value === null
                ? "No result recorded"
                : goalValue(goal, goal.current_value)}
            </p>
            <div
              className="goal-progress"
              role="progressbar"
              aria-label={`${label} target attainment`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={goal.progress ?? undefined}
              aria-valuetext={goal.progress === null ? "Unreported" : `${goal.progress}%`}
            >
              <span style={{ width: `${goal.progress ?? 0}%` }} />
            </div>
            <p className="goal-progress-caption">
              <span>Target attainment</span>
              <span>{goal.progress === null ? "Unreported" : `${goal.progress}%`}</span>
            </p>
            <dl className="goal-period-facts">
              {rows
                .filter(
                  (row) => row.label !== "Recorded result" && row.label !== "Target attainment"
                )
                .map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value(goal)}</dd>
                  </div>
                ))}
            </dl>
          </article>
        ))}
      </div>
      {difference !== null && (
        <p className="goal-help">
          Selected versus previous period: {difference > 0 ? "+" : ""}
          {difference} percentage points of target attainment.
        </p>
      )}
      <details className="goal-comparison-help">
        <summary>
          About this comparison <ChevronDownIcon />
        </summary>
        <p className="goal-help">
          Periods may have different targets, starting values, lengths or incomplete results.
          Compare the measured values alongside attainment; this view does not judge which period
          performed better. No result recorded means unreported, not zero. Attainment is progress
          from the starting value, capped at 0–100%.
        </p>
      </details>
    </>
  );
}
