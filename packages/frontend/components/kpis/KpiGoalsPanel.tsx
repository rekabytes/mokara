"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { atomWithRefresh, loadable } from "jotai/utils";
import { api } from "@/lib/api";
import type { KpiGoal } from "@/lib/kpi-goals";
import { useSession } from "@/lib/session";
import { normalizeError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { KpiGoalHelp } from "./KpiGoalHelp";
import { KpiGoalCard } from "./KpiGoalCard";
import { KpiGoalEditor } from "./KpiGoalEditor";
import { KpiGoalCheckIn } from "./KpiGoalCheckIn";
import { KpiGoalPeriods } from "./KpiGoalPeriods";
import { KpiGoalReview } from "./KpiGoalReview";
import { KpiGoalHistory } from "./KpiGoalHistory";
import "./kpi-goals.css";
type Selection =
  | { kind: "new" }
  | { kind: "check_in" | "edit" | "history" | "review" | "periods"; goalId: string }
  | null;
export function KpiGoalsPanel({ teamId }: { teamId: string }) {
  const session = useSession();
  const focusInspector = useCallback((node: HTMLDivElement | null) => {
    node?.focus();
  }, []);
  const resource = useMemo(
    () =>
      atomWithRefresh(() =>
        typeof window === "undefined" ? Promise.resolve(null) : api.listKpiGoals(teamId)
      ),
    [teamId]
  );
  const state = useAtomValue(useMemo(() => loadable(resource), [resource])),
    refresh = useSetAtom(resource);
  const [selection, setSelection] = useState<Selection>(null),
    [extra, setExtra] = useState<{ goals: KpiGoal[]; next: string | null } | null>(null),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const { run, error } = useAsyncError();
  function reload() {
    setExtra(null);
    refresh();
  }
  const loading = state.state === "loading" || (state.state === "hasData" && !state.data);
  const data = state.state === "hasData" ? state.data : null;
  const goals = data ? [...data.goals, ...(extra?.goals ?? [])] : [];
  const selected =
    selection && selection.kind !== "new"
      ? goals.find((g) => g.id === selection.goalId)
      : undefined;
  const next = extra ? extra.next : data?.next_cursor;
  const onSaved = () => {
    setSelection(null);
    reload();
  };
  return (
    <section className="business-kpis" aria-label="Business KPIs">
      <div className="goal-section-header">
        <div>
          <div className="goal-section-title">
            <h2>Business KPIs</h2>
            {data && (
              <span className="goal-count">
                {goals.length}
                {next ? "+" : ""}
              </span>
            )}
          </div>
          <p className="goal-help">Track measured results against the goals you set.</p>
        </div>
        <div className="goal-actions">
          <button className="btn-base btn-ghost" type="button" onClick={reload} disabled={loading}>
            Refresh KPIs
          </button>
          <button
            className="btn-base btn-primary"
            type="button"
            disabled={!data || selection?.kind === "new"}
            onClick={() => setSelection({ kind: "new" })}
          >
            New KPI
          </button>
        </div>
      </div>
      <KpiGoalHelp />
      {loading ? (
        <p role="status" className="goal-empty">
          Loading business KPIs…
        </p>
      ) : state.state === "hasError" ? (
        <ErrorBanner
          message={normalizeError(state.error, "Couldn't load business KPIs.").message}
        />
      ) : (
        data && (
          <>
            {!data.can_create_team && (
              <p className="goal-help">
                You can create personal KPIs. Shared KPIs are created by the workspace owner after a
                teammate joins.
              </p>
            )}
            {selection && (
              <div
                key={`${selection.kind}:${selected?.id ?? "new"}`}
                className="goal-inspector"
                tabIndex={-1}
                ref={focusInspector}
              >
                {selection?.kind === "new" && session.status === "authed" && (
                  <KpiGoalEditor
                    teamId={teamId}
                    userId={session.user.id}
                    data={data}
                    onSaved={onSaved}
                    onCancel={() => setSelection(null)}
                  />
                )}
                {selected && selection?.kind === "edit" && session.status === "authed" && (
                  <KpiGoalEditor
                    key={`${selected.id}:${selected.revision}`}
                    teamId={teamId}
                    userId={session.user.id}
                    data={data}
                    goal={selected}
                    onSaved={onSaved}
                    onCancel={() => setSelection(null)}
                  />
                )}
                {selected && selection?.kind === "check_in" && (
                  <KpiGoalCheckIn
                    key={`${selected.id}:${selected.revision}`}
                    teamId={teamId}
                    goal={selected}
                    onSaved={onSaved}
                    onCancel={() => setSelection(null)}
                  />
                )}
                {selected && selection?.kind === "periods" && session.status === "authed" && (
                  <KpiGoalPeriods
                    key={selected.id}
                    teamId={teamId}
                    goal={selected}
                    userId={session.user.id}
                    members={data}
                    onSaved={onSaved}
                    onClose={() => setSelection(null)}
                  />
                )}
                {selected && selection?.kind === "review" && (
                  <KpiGoalReview
                    key={`${selected.id}:${selected.revision}`}
                    teamId={teamId}
                    goal={selected}
                    onClose={() => setSelection(null)}
                  />
                )}
                {selected && selection?.kind === "history" && (
                  <KpiGoalHistory
                    key={selected.id}
                    teamId={teamId}
                    goal={selected}
                    onClose={() => setSelection(null)}
                  />
                )}
              </div>
            )}
            <div className="goal-grid">
              {goals.map((goal) => (
                <KpiGoalCard
                  key={goal.id}
                  goal={goal}
                  onAction={(kind) => setSelection({ kind, goalId: goal.id })}
                />
              ))}
            </div>
            {!goals.length && (
              <div className="goal-empty">
                <p>No business KPIs yet.</p>
                <p className="goal-help">
                  Try a monthly sales target or a goal to reduce response time. Existing task-based
                  KPIs keep working as before.
                </p>
              </div>
            )}
            {next && (
              <button
                type="button"
                className="btn-base btn-ghost"
                disabled={busy}
                onClick={async () => {
                  if (pending.current) return;
                  pending.current = true;
                  setBusy(true);
                  try {
                    const result = await run(() => api.listKpiGoals(teamId, next), {
                      fallback: "Couldn't load more business KPIs.",
                    });
                    if (result)
                      setExtra((previous) => ({
                        goals: [...(previous?.goals ?? []), ...result.goals],
                        next: result.next_cursor,
                      }));
                  } finally {
                    pending.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Loading…" : "Load more KPIs"}
              </button>
            )}
          </>
        )
      )}
      <ErrorBanner message={error?.message} />
      <p className="goal-footnote">
        Each KPI uses its own reporting period. Progress measures change from the starting value
        toward the target. Status labels describe recorded results and dates, not a prediction of
        whether a goal is on track.
      </p>
    </section>
  );
}
