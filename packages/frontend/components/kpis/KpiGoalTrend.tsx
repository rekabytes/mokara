"use client";
import { useId } from "react";
import { ChevronDownIcon } from "@/components/Icons";
import { goalValue, type KpiGoalReview } from "@/lib/kpi-goals";
import { observationChange, reviewContext } from "@/lib/kpi-goal-review";

export function KpiGoalTrend({ review }: { review: KpiGoalReview }) {
  const fillId = useId();
  const { goal, observations, as_of: asOf } = review;
  const context = reviewContext(goal, asOf);
  const change = observationChange(observations);
  const ordered = [...observations].reverse();
  const first = ordered[0],
    last = ordered.at(-1);
  const begin = first ? Date.parse(first.observed_on) : 0;
  const span = last ? Date.parse(last.observed_on) - begin : 0;
  const coordinates = ordered.map((p) => ({
    x: span ? 10 + ((Date.parse(p.observed_on) - begin) / span) * 600 : 310,
    y: 150 - p.progress * 1.4,
    point: p,
  }));
  return (
    <>
      <div className="goal-review-summary" role="status">
        <div className="goal-review-result">
          <span className="goal-review-eyebrow">Latest recorded result</span>
          <p>{goal.current_value === null ? "Unreported" : goalValue(goal, goal.current_value)}</p>
          <span className="goal-help">
            Observed {goal.last_observed_on ?? "after your first check-in"}
          </span>
        </div>
        <dl className="goal-review-metrics">
          <div>
            <dt>Target</dt>
            <dd>{goalValue(goal, goal.target)}</dd>
          </div>
          <div>
            <dt>Attainment</dt>
            <dd>{goal.progress === null ? "Unreported" : `${goal.progress}%`}</dd>
          </div>
          <div>
            <dt>Review status</dt>
            <dd className="goal-review-state">{context.label}</dd>
          </div>
        </dl>
      </div>
      <details className="goal-comparison-help goal-review-method">
        <summary>
          About this review
          <ChevronDownIcon />
        </summary>
        <p className="goal-help">{context.detail}</p>
        <p className="goal-help">
          Reviewed on {asOf}, UTC. Pace assumes even progress between the start and end dates. It is
          a guide, not a prediction; seasonal or milestone work may follow a different pattern.
          Older observations can make the comparison incomplete.
        </p>
        <p className="goal-help">
          Lines connect recorded dates only. No results are estimated between them. Progress is
          capped at 0–100%; the table retains the full measured values. Changes are percentage
          points toward the target, not percentage changes in the measured value.
        </p>
      </details>
      {!first ? (
        <p className="goal-empty">
          No observations to plot. Record a check-in to start this trend.
        </p>
      ) : (
        <>
          <figure className="goal-trend">
            <figcaption>
              <span>Progress across recorded dates</span>
              <span className="goal-chart-legend">
                <i aria-hidden="true" />
                Recorded progress
              </span>
            </figcaption>
            <div className="goal-trend-plot">
              <div className="goal-trend-scale" aria-hidden="true">
                <span>100%</span>
                <span>50%</span>
                <span>0%</span>
              </div>
              <div className="goal-trend-canvas">
                <svg
                  viewBox="0 0 620 160"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`Recorded progress for ${goal.name}. Exact results are listed in the table below.`}
                >
                  <defs>
                    <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  {[0, 25, 50, 75, 100].map((value) => (
                    <g key={value}>
                      <line
                        x1="10"
                        x2="610"
                        y1={150 - value * 1.4}
                        y2={150 - value * 1.4}
                        className="goal-trend-grid"
                      />
                    </g>
                  ))}
                  {coordinates.length > 1 && (
                    <polygon
                      points={`${coordinates[0]?.x},150 ${coordinates.map((p) => `${p.x},${p.y}`).join(" ")} ${coordinates.at(-1)?.x},150`}
                      fill={`url(#${fillId})`}
                    />
                  )}
                  <polyline
                    points={coordinates.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    className="goal-trend-line"
                  />
                </svg>
                {coordinates.map(({ x, y, point }) => (
                  <span
                    key={point.id}
                    className="goal-trend-dot"
                    aria-hidden="true"
                    style={{ left: `${(x / 620) * 100}%`, top: `${(y / 160) * 100}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="goal-trend-dates" aria-hidden="true">
              <span>{first.observed_on}</span>
              {last && last !== first && <span>{last.observed_on}</span>}
            </div>
          </figure>
          {change !== null && (
            <p className="goal-review-change">
              <span>{change > 0 ? "↑" : change < 0 ? "↓" : "→"}</span> Change across the latest two
              dates shown: {change > 0 ? "+" : ""}
              {change} percentage points toward the target.
            </p>
          )}
          <div
            className="goal-observations"
            role="region"
            tabIndex={0}
            aria-label="Recorded KPI observations, scroll horizontally for all columns"
          >
            <table>
              <caption>
                Recorded observations, newest first. The last accepted check-in for each date is
                shown. All earlier corrections remain in History.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Observed</th>
                  <th scope="col">Measured result</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.observed_on}</th>
                    <td>{goalValue(goal, p.value)}</td>
                    <td>{p.progress}%</td>
                    <td>
                      {p.author_name}
                      <small>
                        Recorded{" "}
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(p.recorded_at))}
                      </small>
                      {p.note && <p>{p.note}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
