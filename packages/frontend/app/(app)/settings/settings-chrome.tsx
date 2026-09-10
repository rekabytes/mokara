// Settings chrome: the tile shell class, the six hand-drawn section icons, and
// the three presentational primitives every tile is built from (`TileHeader`,
// `Eyebrow`, `Stat`).
//
// `TILE` used to be a `const` inside `SettingsView`'s body. It is the one
// declaration in this split that moved SCOPE as well as file, because
// `BillingTile` needs it and importing it back from `settings-view.tsx` would be
// a cycle. Its string value is unchanged — the census asserts that literal by
// exact match, so a single altered class would fail the gate.
//
// No hooks and no motion in here, so no "use client" directive: these are
// inert building blocks that the client tiles compose.
//
// The icons are route-private (the house rule: an icon graduates to
// `components/Icons.tsx` only when a second file needs the byte-identical
// shape). `LockIcon` also exists in `teams/[id]/team-icons.tsx` and is NOT the
// same drawing — unifying them is a deferred dedupe, not a move.

/** The one tile shell: identity, password, billing, devices and danger all use it. */
export const TILE =
  "min-w-0 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-card)]";

export function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 19.5c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DevicesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9.5 20h5M12 16.5V20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 14.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 12.5l4.5 4.5L19.5 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4 2.8 19.5h18.4L12 4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

// Quiet tile chrome shared by every card: icon chip + title + optional caption.
export function TileHeader({
  icon,
  title,
  caption,
  accent = false,
  right = null,
}: {
  icon: React.ReactNode;
  title: string;
  caption?: string;
  accent?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid size-8 flex-none place-items-center rounded-[var(--radius-icon)] ${
            accent
              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "bg-[var(--color-pill-bg)] text-[var(--color-ink-muted)]"
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-[0.95rem] font-semibold leading-tight">{title}</div>
          {caption && <div className="text-[0.79rem] text-[var(--color-ink-faint)]">{caption}</div>}
        </div>
      </div>
      {right}
    </header>
  );
}

// Micro eyebrow label — the uppercase tracking pattern that ties the plan
// card's two halves together.
export function Eyebrow({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`text-[0.7rem] font-semibold uppercase tracking-[0.14em] ${
        accent ? "text-[var(--color-accent)]" : "text-[var(--color-ink-faint)]"
      }`}
    >
      {children}
    </div>
  );
}

export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--color-border-soft)] p-3.5">
      <b className="block text-[1.3rem] font-extrabold leading-tight tracking-[-0.01em]">{value}</b>
      <span className="text-[0.75rem] text-[var(--color-ink-faint)]">{label}</span>
    </div>
  );
}
