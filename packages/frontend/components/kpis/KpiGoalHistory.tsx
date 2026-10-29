"use client";
import { useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { atomWithRefresh, loadable } from "jotai/utils";
import { api } from "@/lib/api";
import { goalPeriod, goalValue, type KpiGoal, type KpiGoalEntry } from "@/lib/kpi-goals";
import { normalizeError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
export function KpiGoalHistory({
  teamId,
  goal,
  onClose,
}: {
  teamId: string;
  goal: KpiGoal;
  onClose: () => void;
}) {
  const resource = useMemo(
    () =>
      atomWithRefresh(() =>
        typeof window === "undefined" ? Promise.resolve(null) : api.kpiGoalHistory(teamId, goal.id)
      ),
    [teamId, goal.id]
  );
  const state = useAtomValue(useMemo(() => loadable(resource), [resource])),
    refresh = useSetAtom(resource);
  const [extra, setExtra] = useState<{ entries: KpiGoalEntry[]; next: string | null } | null>(null),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const { run, error } = useAsyncError();
  const entries =
    state.state === "hasData" && state.data
      ? [...state.data.entries, ...(extra?.entries ?? [])]
      : [];
  const cursor = extra ? extra.next : state.state === "hasData" ? state.data?.next_cursor : null;
  return (
    <section className="goal-editor" aria-label={`History: ${goal.name}`}>
      <div className="goal-section-header">
        <h3>History · {goal.name}</h3>
        <button type="button" className="btn-base btn-ghost" onClick={onClose}>
          Close history
        </button>
      </div>
      {state.state === "loading" || (state.state === "hasData" && !state.data) ? (
        <p role="status">Loading history…</p>
      ) : state.state === "hasError" ? (
        <>
          <ErrorBanner
            message={normalizeError(state.error, "Couldn't load KPI history.").message}
          />
          <button type="button" className="btn-base btn-ghost" onClick={() => refresh()}>
            Retry history
          </button>
        </>
      ) : (
        <>
          <ol className="goal-history">
            {entries.map((entry) => (
              <li key={entry.id}>
                <p className="goal-history-title">
                  {entry.kind === "check_in"
                    ? `Check-in: ${goalValue(entry.snapshot, entry.value ?? "0")}`
                    : entry.kind === "created"
                      ? "KPI created"
                      : "Details updated"}
                </p>
                <p className="goal-help">
                  {entry.author_name} ·{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(entry.created_at))}
                  {entry.observed_on ? ` · Observed ${entry.observed_on}` : ""}
                </p>
                {entry.note && <p className="goal-history-note">{entry.note}</p>}
                {entry.kind !== "check_in" && (
                  <p className="goal-help">
                    Owner: {entry.snapshot.owner_name} ·{" "}
                    {goalValue(entry.snapshot, entry.snapshot.baseline)} →{" "}
                    {goalValue(entry.snapshot, entry.snapshot.target)} ·{" "}
                    {goalPeriod(entry.snapshot)}
                    {entry.snapshot.archived ? " · Archived" : ""}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {cursor && (
            <button
              type="button"
              className="btn-base btn-ghost"
              disabled={busy}
              onClick={async () => {
                if (pending.current) return;
                pending.current = true;
                setBusy(true);
                try {
                  const result = await run(() => api.kpiGoalHistory(teamId, goal.id, cursor), {
                    fallback: "Couldn't load more KPI history.",
                  });
                  if (result)
                    setExtra((previous) => ({
                      entries: [...(previous?.entries ?? []), ...result.entries],
                      next: result.next_cursor,
                    }));
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            >
              {busy ? "Loading…" : "Load older updates"}
            </button>
          )}
        </>
      )}
      <ErrorBanner message={error?.message} />
    </section>
  );
}
