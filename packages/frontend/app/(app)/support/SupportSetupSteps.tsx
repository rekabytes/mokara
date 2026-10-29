const steps = ["Website details", "Embed form", "Send a test ticket"];
export function SupportSetupSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="support-setup-steps" aria-label="Website setup">
      {steps.map((label, index) => (
        <li key={label} aria-current={current === index + 1 ? "step" : undefined}>
          <span className="support-setup-step-number" aria-hidden="true">
            {index + 1}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
