import type { KpiGoal } from "./kpi-goals";

const day = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86400000;

// A calendar comparison, not a forecast. The server supplies the review date.
export function reviewContext(goal: KpiGoal, asOf: string) {
  const start = day(goal.start_date),
    end = day(goal.end_date),
    today = day(asOf);
  const duration = end - start;
  const expected =
    duration === 0
      ? today >= end
        ? 100
        : 0
      : Math.floor((Math.max(0, Math.min(duration, today - start)) * 10000) / duration) / 100;
  const days = end - today;
  if (goal.archived)
    return {
      label: "Archived",
      detail: "Results are retained. This KPI is no longer accepting check-ins.",
      expected: null,
    };
  if (today < start)
    return {
      label: "Not started",
      detail: `The reporting period starts on ${goal.start_date}.`,
      expected: null,
    };
  if (goal.progress === null)
    return {
      label: "No recorded result",
      detail:
        days < 0
          ? "The period ended without a recorded result. No outcome can be inferred."
          : `Record a check-in to review progress. The period ends on ${goal.end_date}.`,
      expected: null,
    };
  if (goal.progress >= 100)
    return {
      label: "Target recorded",
      detail: `The latest recorded result reaches the target. Observation date: ${goal.last_observed_on}.`,
      expected: null,
    };
  if (days < 0)
    return {
      label: "Period ended",
      detail: `The latest recorded result is ${goal.progress}% of the target. Late check-ins may still update it.`,
      expected: null,
    };
  return {
    label: goal.progress < expected ? "Below pace guide" : "At or above pace guide",
    detail: `${days === 0 ? "Due today" : `${days} ${days === 1 ? "day" : "days"} left`}. Recorded progress is ${goal.progress}%; a straight-line guide is ${expected}% on ${asOf}. Latest observation: ${goal.last_observed_on}.`,
    expected,
  };
}

export function observationChange(points: { progress: number }[]) {
  const [latest, previous] = points;
  return latest && previous ? Math.round((latest.progress - previous.progress) * 100) / 100 : null;
}
