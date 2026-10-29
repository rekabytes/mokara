"use client";
import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { atomWithRefresh, loadable } from "jotai/utils";
import { api } from "@/lib/api";
import type { KpiGoal } from "@/lib/kpi-goals";
import { normalizeError } from "@/lib/errors";
import { ErrorBanner } from "@/components/ErrorBanner";
import { KpiGoalTrend } from "./KpiGoalTrend";

export function KpiGoalReview({
  teamId,
  goal,
  onClose,
}: {
  teamId: string;
  goal: KpiGoal;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState<string | undefined>();
  const resource = useMemo(
    () =>
      atomWithRefresh(() =>
        typeof window === "undefined"
          ? Promise.resolve(null)
          : api.kpiGoalReview(teamId, goal.id, cursor)
      ),
    [teamId, goal.id, cursor]
  );
  const state = useAtomValue(useMemo(() => loadable(resource), [resource]));
  const refresh = useSetAtom(resource);
  const data = state.state === "hasData" ? state.data : null;
  const loading = state.state === "loading" || (state.state === "hasData" && !state.data);
  return (
    <section className="goal-editor goal-review" aria-label={`Review: ${goal.name}`}>
      <div className="goal-section-header">
        <div className="goal-review-heading">
          <p className="goal-review-eyebrow">Performance review</p>
          <h3>{goal.name}</h3>
          <p className="goal-help">
            {goal.start_date} → {goal.end_date}
          </p>
        </div>
        <div className="goal-actions">
          <button
            type="button"
            className="btn-base btn-ghost"
            disabled={loading}
            onClick={() => {
              if (cursor) setCursor(undefined);
              else refresh();
            }}
          >
            Refresh review
          </button>
          <button type="button" className="btn-base btn-ghost" onClick={onClose}>
            Close review
          </button>
        </div>
      </div>
      {loading ? (
        <p role="status">Loading KPI review…</p>
      ) : state.state === "hasError" ? (
        <ErrorBanner
          message={normalizeError(state.error, "Couldn't load the KPI review.").message}
        />
      ) : (
        data && (
          <>
            <KpiGoalTrend review={data} />
            <div className="goal-actions">
              {cursor && (
                <button
                  type="button"
                  className="btn-base btn-ghost"
                  onClick={() => setCursor(undefined)}
                >
                  Latest observations
                </button>
              )}
              {data.next_cursor && (
                <button
                  type="button"
                  className="btn-base btn-ghost"
                  onClick={() => setCursor(data.next_cursor ?? undefined)}
                >
                  Older observations
                </button>
              )}
            </div>
            <p className="goal-footnote">
              Showing up to 30 observation dates. The summary always uses the latest saved result
              for the full goal.
            </p>
          </>
        )
      )}
    </section>
  );
}
