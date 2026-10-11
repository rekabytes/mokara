import type { Analytics } from "@/lib/api";
import { pct, totalTasks } from "./analytics-model";

export function DistributionCard({ data }: { data: Analytics | null }) {
  return data ? (
    <section className="mt-3 mb-4 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)]">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[0.8rem] font-semibold">Current distribution</span>
        <span className="text-[0.78rem] text-[var(--color-ink-muted)]">
          <b className="font-semibold text-[var(--color-ink)]">{pct(data.totals)}%</b> of{" "}
          {totalTasks(data.totals)} tasks completed
        </span>
      </div>
      <ProgressBar totals={data.totals} />
      <div className="mt-3 flex flex-wrap gap-3.5">
        {[
          { key: "completed" as const, label: "Completed", token: "var(--color-accent)" },
          { key: "in_progress" as const, label: "In progress", token: "var(--color-warning)" },
          { key: "open" as const, label: "Open", token: "rgba(148,163,184,0.55)" },
          { key: "canceled" as const, label: "Canceled", token: "var(--color-danger)" },
        ].map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1.5 text-[0.75rem] text-[var(--color-ink-muted)]"
          >
            <span className="block size-2 rounded-[3px]" style={{ background: s.token }} />
            {s.label}{" "}
            <span className="font-semibold text-[var(--color-ink)]">{data.totals[s.key]}</span>
          </span>
        ))}
      </div>
    </section>
  ) : null;
}

function ProgressBar({ totals }: { totals: Analytics["totals"] }) {
  const total = totalTasks(totals);
  if (total === 0) return <div className="h-2.5 rounded-[999px] bg-[rgba(148,163,184,0.18)]" />;
  const segs: { key: string; n: number; bg: string }[] = [
    { key: "completed", n: totals.completed, bg: "var(--color-accent)" },
    { key: "in_progress", n: totals.in_progress, bg: "var(--color-warning)" },
    { key: "open", n: totals.open, bg: "rgba(148,163,184,0.55)" },
    { key: "canceled", n: totals.canceled, bg: "var(--color-danger)" },
  ];
  return (
    <div className="flex h-2.5 overflow-hidden rounded-[999px] bg-[rgba(148,163,184,0.18)]">
      {segs.map((s) => (
        <div
          key={s.key}
          style={{ width: `${(s.n / total) * 100}%`, background: s.bg }}
          className="h-full transition-[width] duration-300"
        />
      ))}
    </div>
  );
}
