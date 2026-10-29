"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { KpiGoal, KpiGoalList, CreateKpiGoalInput } from "@/lib/kpi-goals";
import { goalPeriod, goalValue } from "@/lib/kpi-goals";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { nextPeriodDates } from "@/lib/kpi-periods";
import { GoalSelect } from "./goal-fields";
export function KpiGoalEditor({
  teamId,
  userId,
  data,
  goal,
  previousGoal,
  onSaved,
  onCancel,
}: {
  teamId: string;
  userId: string;
  data: KpiGoalList;
  goal?: KpiGoal;
  previousGoal?: KpiGoal;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const seed = goal ?? previousGoal;
  const [cadence, setCadence] = useState<1 | 3>(1);
  const suggested = previousGoal ? nextPeriodDates(previousGoal.end_date, cadence) : null;
  const [name, setName] = useState(seed?.name ?? "");
  const [scope, setScope] = useState<"personal" | "team">(seed?.scope ?? "personal");
  const [measurement, setMeasurement] = useState<CreateKpiGoalInput["measurement"]>(
    seed?.measurement ?? "number"
  );
  const [owner, setOwner] = useState(
      data.members.some((member) => member.id === seed?.owner_id)
        ? (seed?.owner_id ?? userId)
        : userId
    ),
    [contributors, setContributors] = useState(
      seed?.contributor_ids.filter((id) => data.members.some((member) => member.id === id)) ?? []
    );
  const [unit, setUnit] = useState(seed?.unit ?? ""),
    [baseline, setBaseline] = useState(seed?.baseline ?? "0"),
    [target, setTarget] = useState(seed?.target ?? "");
  const [start, setStart] = useState(suggested?.start_date ?? goal?.start_date ?? ""),
    [archived, setArchived] = useState(goal?.archived ?? false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false),
    requestId = useRef<string | null>(null);
  const { run, error } = useAsyncError();
  return (
    <form
      className="goal-editor"
      aria-label={
        goal ? "Edit business KPI" : previousGoal ? "Create next KPI period" : "Create business KPI"
      }
      onSubmit={async (event) => {
        event.preventDefault();
        // Read native date controls at submit time so keyboard/calendar entry
        // does not depend on React mirroring a browser-specific date event.
        const fields = new FormData(event.currentTarget);
        const periodStart = fields.get("start_date"),
          periodEnd = fields.get("end_date");
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        const id = (requestId.current ??= crypto.randomUUID());
        try {
          const result = await run(
            () =>
              goal
                ? api.updateKpiGoal(teamId, goal.id, {
                    request_id: id,
                    expected_revision: goal.revision,
                    name,
                    owner_id: owner,
                    contributor_ids: contributors,
                    archived,
                  })
                : previousGoal
                  ? api.createKpiPeriod(teamId, previousGoal.id, {
                      request_id: id,
                      expected_revision: previousGoal.revision,
                      name,
                      scope,
                      measurement,
                      unit: previousGoal.unit,
                      baseline,
                      target,
                      owner_id: owner,
                      contributor_ids: contributors,
                      start_date: typeof periodStart === "string" ? periodStart : "",
                      end_date: typeof periodEnd === "string" ? periodEnd : "",
                    })
                  : api.createKpiGoal(teamId, {
                      request_id: id,
                      name,
                      scope,
                      measurement,
                      unit: measurement === "percentage" ? "%" : unit.trim() || null,
                      baseline,
                      target,
                      start_date: typeof periodStart === "string" ? periodStart : "",
                      end_date: typeof periodEnd === "string" ? periodEnd : "",
                      owner_id: owner,
                      contributor_ids: contributors,
                    }),
            {
              fallback:
                "Couldn't save this KPI. Retry the same request, or refresh to check its saved state.",
            }
          );
          if (result) onSaved();
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      <h3>
        {goal
          ? "Edit KPI details"
          : previousGoal
            ? "Create next reporting period"
            : "New business KPI"}
      </h3>
      {previousGoal && (
        <>
          <p className="goal-help">
            Previous period: {goalPeriod(previousGoal)}. Confirm the name, dates, owner, starting
            value and target. Results and check-ins start empty; the previous period stays
            unchanged. No future periods will be created automatically.
          </p>
          <label className="goal-field">
            Suggested period
            <GoalSelect
              value={String(cadence)}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "1" || value === "3") {
                  setCadence(value === "1" ? 1 : 3);
                  setStart(
                    nextPeriodDates(previousGoal.end_date, value === "1" ? 1 : 3).start_date
                  );
                }
              }}
            >
              <option value="1">Monthly, one month</option>
              <option value="3">Quarterly, three months</option>
            </GoalSelect>
          </label>
        </>
      )}
      <ErrorBanner message={error?.message} />
      <div className="goal-form-grid">
        <label className="goal-field goal-field-wide">
          KPI name
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            disabled={busy}
          />
        </label>
        <label className="goal-field">
          Visibility
          <GoalSelect
            value={scope}
            disabled={!!goal || !!previousGoal || busy}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "personal" || value === "team") {
                setScope(value);
                if (value === "personal") {
                  setOwner(userId);
                  setContributors([]);
                }
              }
            }}
          >
            <option value="personal">Personal, only you</option>
            {(data.can_create_team || seed?.scope === "team") && (
              <option value="team">Team, shared with this workspace</option>
            )}
          </GoalSelect>
        </label>
        <label className="goal-field">
          Accountable owner
          <GoalSelect
            value={owner}
            disabled={scope === "personal" || busy}
            required
            onChange={(e) => {
              setOwner(e.target.value);
              setContributors((ids) => ids.filter((id) => id !== e.target.value));
            }}
          >
            {data.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </GoalSelect>
        </label>
        {!goal ? (
          <>
            <label className="goal-field">
              Measurement
              <GoalSelect
                value={measurement}
                disabled={!!previousGoal || busy}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "number" || value === "percentage" || value === "money") {
                    setMeasurement(value);
                    setUnit(value === "money" ? "MYR" : value === "percentage" ? "%" : "");
                  }
                }}
              >
                <option value="number">Number</option>
                <option value="percentage">Percentage</option>
                <option value="money">Money</option>
              </GoalSelect>
            </label>
            <label className="goal-field">
              {measurement === "money" ? "Currency code" : "Unit, optional"}
              <input
                className="field"
                value={measurement === "percentage" ? "%" : unit}
                onChange={(e) =>
                  setUnit(measurement === "money" ? e.target.value.toUpperCase() : e.target.value)
                }
                disabled={!!previousGoal || measurement === "percentage" || busy}
                required={measurement === "money"}
                pattern={measurement === "money" ? "[A-Z]{3}" : undefined}
                maxLength={measurement === "money" ? 3 : 30}
                placeholder={measurement === "money" ? "MYR" : "e.g. leads or hours"}
              />
            </label>
            <label className="goal-field">
              Starting value
              <input
                className="field"
                type="number"
                step="0.0001"
                min={measurement === "percentage" ? 0 : undefined}
                max={measurement === "percentage" ? 100 : undefined}
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label className="goal-field">
              Target value
              <input
                className="field"
                type="number"
                step="0.0001"
                min={measurement === "percentage" ? 0 : undefined}
                max={measurement === "percentage" ? 100 : undefined}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label className="goal-field">
              Period starts
              <input
                className="field"
                type="date"
                name="start_date"
                key={`start-${cadence}`}
                defaultValue={suggested?.start_date ?? ""}
                min={
                  previousGoal ? nextPeriodDates(previousGoal.end_date, 1).start_date : undefined
                }
                onChange={(e) => setStart(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label className="goal-field">
              Period ends
              <input
                className="field"
                type="date"
                name="end_date"
                key={`end-${cadence}`}
                defaultValue={suggested?.end_date ?? ""}
                min={start}
                required
                disabled={busy}
              />
            </label>
          </>
        ) : (
          <p className="goal-help goal-field-wide">
            {goalValue(goal, goal.baseline)} → {goalValue(goal, goal.target)} · {goalPeriod(goal)}.
            Visibility, measurement, target and period stay fixed to protect this goal’s history.
            Create a new KPI for a different target or period.
          </p>
        )}
      </div>
      {scope === "team" && (
        <fieldset className="goal-contributors" disabled={busy}>
          <legend>Contributors who can submit check-ins</legend>
          <p className="goal-help">
            The accountable owner and workspace owner can also update this KPI. Other team members
            can read it.
          </p>
          <div>
            {data.members
              .filter((member) => member.id !== owner)
              .map((member) => (
                <label key={member.id}>
                  <input
                    type="checkbox"
                    checked={contributors.includes(member.id)}
                    onChange={(e) =>
                      setContributors((ids) =>
                        e.target.checked
                          ? [...ids, member.id]
                          : ids.filter((id) => id !== member.id)
                      )
                    }
                  />
                  {member.name}
                </label>
              ))}
          </div>
        </fieldset>
      )}
      {goal && (
        <label className="goal-checkbox">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            disabled={busy}
          />
          Archive this KPI, keeping all results and history
        </label>
      )}
      <p className="goal-help">
        Record actual business results. Completing a task does not change this KPI.
      </p>
      <div className="goal-actions">
        <button className="btn-base btn-primary" disabled={busy}>
          {busy ? "Saving…" : goal ? "Save details" : previousGoal ? "Create period" : "Create KPI"}
        </button>
        <button type="button" className="btn-base btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
