"use client";
import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { atomWithRefresh, loadable } from "jotai/utils";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import type { KpiGoal, KpiGoalList } from "@/lib/kpi-goals";
import { ErrorBanner } from "@/components/ErrorBanner";
import { KpiGoalEditor } from "./KpiGoalEditor";
import { KpiPeriodComparison } from "./KpiPeriodComparison";

export function KpiGoalPeriods({
  teamId,
  goal,
  userId,
  members,
  onSaved,
  onClose,
}: {
  teamId: string;
  goal: KpiGoal;
  userId: string;
  members: KpiGoalList;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(goal.id),
    [creating, setCreating] = useState(false);
  const resource = useMemo(
    () =>
      atomWithRefresh(() =>
        typeof window === "undefined" ? Promise.resolve(null) : api.kpiGoalPeriods(teamId, selected)
      ),
    [teamId, selected]
  );
  const state = useAtomValue(useMemo(() => loadable(resource), [resource])),
    refresh = useSetAtom(resource);
  const data = state.state === "hasData" ? state.data : null;
  const loading = state.state === "loading" || (state.state === "hasData" && !state.data);
  return (
    <section className="goal-editor" aria-label={`Reporting periods: ${goal.name}`}>
      <div className="goal-section-header">
        <h3>Reporting periods</h3>
        <div className="goal-actions">
          <button
            type="button"
            className="btn-base btn-ghost"
            disabled={loading || creating}
            onClick={() => refresh()}
          >
            Refresh periods
          </button>
          <button type="button" className="btn-base btn-ghost" onClick={onClose}>
            Close periods
          </button>
        </div>
      </div>
      {loading ? (
        <p role="status">Loading reporting periods…</p>
      ) : state.state === "hasError" ? (
        <ErrorBanner
          message={normalizeError(state.error, "Couldn't load reporting periods.").message}
        />
      ) : (
        data && (
          <>
            <KpiPeriodComparison periods={data} />
            {!creating && (
              <div className="goal-actions">
                {data.previous && (
                  <button
                    type="button"
                    className="btn-base btn-ghost"
                    onClick={() => setSelected(data.previous?.id ?? selected)}
                  >
                    View previous period
                  </button>
                )}
                {data.next && (
                  <button
                    type="button"
                    className="btn-base btn-ghost"
                    onClick={() => setSelected(data.next?.id ?? selected)}
                  >
                    View next period
                  </button>
                )}
                {data.goal.can_create_period && (
                  <button
                    type="button"
                    className="btn-base btn-primary"
                    onClick={() => setCreating(true)}
                  >
                    Create next period
                  </button>
                )}
              </div>
            )}
            {!data.goal.can_create_period && !data.next && (
              <p className="goal-help">
                Only the personal KPI owner or shared workspace owner can create its next period.
              </p>
            )}
            {creating && data.goal.can_create_period && (
              <KpiGoalEditor
                key={`${data.goal.id}:${data.goal.revision}`}
                teamId={teamId}
                userId={userId}
                data={members}
                previousGoal={data.goal}
                onSaved={onSaved}
                onCancel={() => setCreating(false)}
              />
            )}
          </>
        )
      )}
    </section>
  );
}
