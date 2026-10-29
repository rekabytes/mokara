"use client";
import { useState } from "react";
import { goalValue, goalPeriod, goalState, type KpiGoal } from "@/lib/kpi-goals";
import { ChevronDownIcon } from "@/components/Icons";
export function KpiGoalCard({
  goal,
  onAction,
}: {
  goal: KpiGoal;
  onAction: (action: "check_in" | "edit" | "history" | "review" | "periods") => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const perform = (action: Parameters<typeof onAction>[0]) => {
    setMenuOpen(false);
    onAction(action);
  };
  return (
    <article className="goal-card">
      <div className="goal-card-title">
        <h3>{goal.name}</h3>
        <span className="goal-scope">{goal.scope === "team" ? "Team" : "Personal"}</span>
      </div>
      <p className="goal-card-period">{goalPeriod(goal)}</p>
      <p className="goal-measurement-label">Recorded result</p>
      <div className="goal-measurement">
        <span>
          {goal.current_value === null ? "No result yet" : goalValue(goal, goal.current_value)}
        </span>
        <span className="goal-card-target">Target {goalValue(goal, goal.target)}</span>
      </div>
      <div
        className="goal-progress"
        role="progressbar"
        aria-label={`${goal.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={goal.progress ?? undefined}
        aria-valuetext={goal.progress === null ? "No check-ins yet" : `${goal.progress}% of target`}
      >
        <span style={{ width: `${goal.progress ?? 0}%` }} />
      </div>
      <div className="goal-progress-caption">
        <span>{goalState(goal)}</span>
        <span>{goal.progress === null ? "Awaiting a check-in" : `${goal.progress}%`}</span>
      </div>
      <dl className="goal-card-facts">
        <div>
          <dt>Starting value</dt>
          <dd>{goalValue(goal, goal.baseline)}</dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>{goal.last_observed_on ?? "Not recorded"}</dd>
        </div>
      </dl>
      <div className="goal-card-owner">
        <span className="goal-owner-mark" aria-hidden="true">
          {goal.owner_id ? (Array.from(goal.owner_name)[0]?.toUpperCase() ?? "?") : "—"}
        </span>
        <span>{goal.owner_id ? goal.owner_name : `Unassigned, previously ${goal.owner_name}`}</span>
      </div>
      {goal.last_check_in_at && (
        <p className="goal-card-updated">
          Last check-in{" "}
          {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(goal.last_check_in_at)
          )}
        </p>
      )}
      <div className="goal-card-actions">
        {goal.can_check_in && (
          <button
            className="btn-base goal-check-in"
            type="button"
            onClick={() => perform("check_in")}
          >
            Check in
          </button>
        )}
        <button
          className="btn-base goal-review-action"
          type="button"
          onClick={() => perform("review")}
        >
          Review trend
        </button>
        <details className="goal-more" open={menuOpen}>
          <summary
            aria-label={`More actions for ${goal.name}`}
            onClick={(event) => {
              event.preventDefault();
              setMenuOpen((open) => !open);
            }}
          >
            More <ChevronDownIcon />
          </summary>
          <div>
            <button type="button" onClick={() => perform("periods")}>
              Reporting periods
            </button>
            <button type="button" onClick={() => perform("history")}>
              History
            </button>
            {goal.can_manage && (
              <button type="button" onClick={() => perform("edit")}>
                Edit details
              </button>
            )}
          </div>
        </details>
      </div>
    </article>
  );
}
