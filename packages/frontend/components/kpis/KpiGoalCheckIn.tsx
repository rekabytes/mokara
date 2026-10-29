"use client";
import { useRef, useState } from "react";
import type { KpiGoal } from "@/lib/kpi-goals";
import { goalValue } from "@/lib/kpi-goals";
import { api } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
export function KpiGoalCheckIn({
  teamId,
  goal,
  onSaved,
  onCancel,
}: {
  teamId: string;
  goal: KpiGoal;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(goal.current_value ?? ""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false),
    requestId = useRef<string | null>(null);
  const { run, error } = useAsyncError();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      className="goal-editor"
      aria-label={`Check in: ${goal.name}`}
      onSubmit={async (event) => {
        event.preventDefault();
        const observed = new FormData(event.currentTarget).get("observed_on");
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        const id = (requestId.current ??= crypto.randomUUID());
        try {
          const result = await run(
            () =>
              api.checkInKpiGoal(teamId, goal.id, {
                request_id: id,
                expected_revision: goal.revision,
                value,
                observed_on: typeof observed === "string" ? observed : "",
                note,
              }),
            {
              fallback:
                "Couldn't save this check-in. Retry the same request or refresh the KPI to check its saved state.",
            }
          );
          if (result) onSaved();
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      <h3>Check in · {goal.name}</h3>
      <p className="goal-help">
        Enter the actual total or measured value for this date, not an amount to add. Target:{" "}
        {goalValue(goal, goal.target)}.
      </p>
      <ErrorBanner message={error?.message} />
      <div className="goal-form-grid">
        <label className="goal-field">
          Measured value
          <input
            className="field"
            type="number"
            step="0.0001"
            min={goal.measurement === "percentage" ? 0 : undefined}
            max={goal.measurement === "percentage" ? 100 : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label className="goal-field">
          Observation date
          <input
            className="field"
            type="date"
            name="observed_on"
            min={goal.start_date}
            max={goal.end_date < today ? goal.end_date : today}
            required
            disabled={busy}
          />
        </label>
        <label className="goal-field goal-field-wide">
          Note, optional
          <textarea
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={3}
            disabled={busy}
          />
        </label>
      </div>
      <p className="goal-help">
        Older observations remain in history without replacing a more recent result.
      </p>
      <div className="goal-actions">
        <button className="btn-base btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save check-in"}
        </button>
        <button type="button" className="btn-base btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
