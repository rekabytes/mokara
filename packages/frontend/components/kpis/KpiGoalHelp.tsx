export function KpiGoalHelp() {
  return (
    <details className="goal-help-disclosure">
      <summary>
        <span>How business KPIs work</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div>
        <ol>
          <li>Create a personal KPI, or ask your workspace owner to create a shared team KPI.</li>
          <li>
            Choose the starting value, target and reporting dates. Use a number, percentage or money
            amount.
          </li>
          <li>
            For a team KPI, name its accountable owner and choose contributors who can submit
            results. Other teammates can read it.
          </li>
          <li>
            Check in with the actual measured value for a date, such as the total sales to date. The
            latest observation date determines the current result. Values are not added to previous
            amounts.
          </li>
          <li>
            Use History to review who recorded each result and any notes. Backdated check-ins stay
            in history without replacing newer observations.
          </li>
          <li>
            Open Review trend to compare recorded dates and see deadline context. Its pace guide
            assumes even progress; it does not predict success or failure. Corrections for the same
            date appear once in the trend and remain available in History.
          </li>
          <li>
            Use More → Reporting periods to compare linked periods. The personal KPI owner or
            workspace owner can confirm a new monthly or quarterly period, keeping past targets and
            results. Each new period starts without check-ins. Nothing is scheduled automatically.
          </li>
        </ol>
        <p>
          Example: MYR 5,000 from a starting value of MYR 0 toward MYR 20,000 is 25%. Reducing
          response time from 24 hours toward 12 hours reaches 50% at 18 hours.
        </p>
        <p>
          Targets and periods stay fixed so past results keep their meaning. Create a new KPI for
          another period or target. Archive old goals to retain their history.
        </p>
        <p>
          Your task-based KPIs keep their existing calculation. Completing tasks does not change a
          business KPI. These goals use manual check-ins in the web app; automatic data imports are
          not included yet.
        </p>
      </div>
    </details>
  );
}
