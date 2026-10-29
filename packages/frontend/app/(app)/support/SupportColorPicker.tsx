import { supportAccentInk } from "@/lib/support-model";
type ColorPreset = { name: string; value: string };
export function SupportColorPicker({
  id,
  label,
  name,
  value,
  swatch,
  selected,
  hint,
  presets,
  resetLabel,
  onChange,
  onReset,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  swatch: string;
  selected: string | null;
  hint: string;
  presets: readonly ColorPreset[];
  resetLabel: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div className="support-field">
      <label htmlFor={id}>{label}</label>
      <div className="support-color-controls">
        <label className="support-color-well" title={`Choose ${label.toLowerCase()} color`}>
          <span className="sr-only">Choose {label.toLowerCase()} color</span>
          <input
            type="color"
            value={swatch}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={`${id}-help`}
          />
        </label>
        <input
          id={id}
          className="support-color-hex"
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          maxLength={7}
          required
          spellCheck={false}
          autoCapitalize="characters"
          aria-invalid={!valid}
          aria-describedby={`${id}-help`}
        />
        <button type="button" className="support-text-button" onClick={onReset}>
          {resetLabel}
        </button>
      </div>
      <div className="support-color-presets" role="group" aria-label={`${label} presets`}>
        {presets.map((preset) => (
          <button
            type="button"
            key={preset.value}
            className="support-color-preset"
            aria-label={`${label}: ${preset.name} ${preset.value.toUpperCase()}`}
            aria-pressed={selected === preset.value}
            onClick={() => onChange(preset.value)}
            style={{ backgroundColor: preset.value, color: supportAccentInk(preset.value) }}
          >
            {selected === preset.value && (
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="m6 12 4 4 8-8" />
              </svg>
            )}
          </button>
        ))}
      </div>
      <span id={`${id}-help`} className="support-muted">
        {valid ? hint : "Enter # followed by six hexadecimal digits, for example #6366F1."}
      </span>
    </div>
  );
}
