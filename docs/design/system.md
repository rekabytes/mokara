# Mokara Design System

The single source of truth for styling on the frontend. All tokens live in
[`packages/frontend/app/globals.css`](../packages/frontend/app/globals.css) in
the Tailwind v4 `@theme` block. Use these names everywhere — never invent a
one-off hex, shadow, or radius in a component.

> **Stack:** Tailwind v4 (no `tailwind.config.*`) + the small set of `@utility`
> recipes in `globals.css`. Don't reach for inline styles or per-component CSS
> modules.

---

## 1 · Color tokens

All names are auto-registered as Tailwind utilities: `bg-{name}`, `text-{name}`,
`border-{name}`, etc.

### Surface & border

| Token                  | Value                              | Use for                                        |
| ---------------------- | ---------------------------------- | ---------------------------------------------- |
| `surface`              | `rgba(255,255,255,0.72)`           | Translucent glass panels (cards, sidebar)      |
| `surface-2`            | `rgba(255,255,255,0.55)`           | Hover state of glass surfaces                  |
| `surface-solid`        | `#ffffff`                          | Active nav item, opaque chip                   |
| `border-soft`          | `rgba(15,23,42,0.07)`              | Default hairline borders                       |
| `border-strong`        | `rgba(15,23,42,0.13)`              | Ghost button border, hover border, ring shadow |

### Text

| Token        | Value      | Use for                                          |
| ------------ | ---------- | ------------------------------------------------ |
| `ink`        | `#0f172a`  | Body text, headings                              |
| `ink-muted`  | `#64748b`  | Secondary text, labels, placeholders             |
| `ink-faint`  | `#94a3b8`  | Hints, timestamps, disabled-adjacent             |

### Accent (indigo)

| Token           | Value                              | Use for                          |
| --------------- | ---------------------------------- | -------------------------------- |
| `accent`        | `#6366f1`                          | Primary buttons, active links    |
| `accent-hover`  | `#5457e5`                          | Primary button hover             |
| `accent-soft`   | `rgba(99,102,241,0.12)`            | Tints, chips, focus rings        |

### Status

| Token            | Value                              | Use for                              |
| ---------------- | ---------------------------------- | ------------------------------------ |
| `danger`         | `#ef4444`                          | Destructive icon/button text         |
| `danger-soft`    | `rgba(239,68,68,0.1)`              | Danger hover background              |
| `danger-border`  | `rgba(239,68,68,0.2)`              | Alert border, danger-button border   |
| `danger-ink`     | `#b91c1c`                          | Alert text                           |
| `success`        | `#15803d`                          | "Done" pill text                     |
| `success-soft`   | `rgba(34,197,94,0.14)`             | "Done" pill bg                       |
| `warning`        | `#a16207`                          | "Todo" pill text                     |
| `warning-soft`   | `rgba(234,179,8,0.16)`             | "Todo" pill bg                       |
| `progress`       | `#4f46e5`                          | "In progress" + "owner" pill text    |
| `progress-soft`  | `rgba(99,102,241,0.14)`            | "In progress" + "owner" pill bg      |

### Priority & pills

| Token          | Value                              | Use for                          |
| -------------- | ---------------------------------- | -------------------------------- |
| `prio-high`    | `#f43f5e`                           | High priority (red)              |
| `prio-medium`  | `#f59e0b`                           | Medium priority (amber)          |
| `prio-low`     | `#94a3b8`                           | Low priority (gray)              |
| `pill-bg`      | `rgba(148,163,184,0.16)`            | Default pill background           |

---

## 2 · Radius

| Token       | Value   | Use for                                  |
| ----------- | ------- | ---------------------------------------- |
| `radius-card` | `18px` | Cards, panels, glass surfaces          |
| `radius-btn`  | `11px` | Buttons, fields, segmented controls   |
| `radius-icon` | `10px` | Icon buttons, nav items, segmented buttons |
| `radius-pill` | `999px`| Pills, chips, avatars, badges         |

---

## 3 · Shadow

| Token        | Value                                                          | Use for                          |
| ------------ | -------------------------------------------------------------- | -------------------------------- |
| `shadow-xs`    | `0 1px 2px rgba(15,23,42,0.04)`                              | Small chips                      |
| `shadow-card`  | `0 1px 3px rgba(15,23,42,0.05), 0 10px 30px rgba(15,23,42,0.06)` | Default card / panel lift      |
| `shadow-lift`  | `0 4px 12px rgba(15,23,42,0.06), 0 24px 48px rgba(15,23,42,0.1)` | Row hover lift, modal         |
| `shadow-accent`| `0 4px 14px rgba(99,102,241,0.32)`                          | Primary button glow              |
| `shadow-toggle`| `0 1px 3px rgba(15,23,42,0.1)`                               | Active segmented chip            |

---

## 4 · Glass + motion

```css
--blur-glass: saturate(180%) blur(22px);
--ease-snap:  cubic-bezier(0.22, 1, 0.36, 1);
```

- Apply `--blur-glass` via the `glass-blur` utility (see §6).
- All hover/transition timings: `0.14–0.18s` with `--ease-snap`.

---

## 5 · Spacing scale

Tailwind v4 defaults apply (4px grid via `--spacing: 0.25rem`). Use the
canonical class names — no arbitrary values unless genuinely needed.

| Class       | Value | Typical use                              |
| ----------- | ----- | ---------------------------------------- |
| `gap-1`     | 4px   | Tight icon/text gap                      |
| `gap-2`     | 8px   | Button row, inline form fields           |
| `gap-3`     | 12px  | Inline form rows                         |
| `gap-4`     | 16px  | Section gap, form spacing                |
| `gap-6`     | 24px  | Page-level section spacing               |
| `gap-9`     | 36px  | Page hero → body                         |

### Page padding convention

```
<main className="px-[clamp(1.5rem,4vw,3rem)] pt-4 pb-16 max-[800px]:pt-[4rem]">
```

| Slot         | Value                          | Notes                                |
| ------------ | ------------------------------ | ------------------------------------ |
| `main` `px-` | `clamp(1.5rem, 4vw, 3rem)`     | Responsive gutter                    |
| `main` `pt-` | `4` (16px)                     | Aligns with sidebar MOKARA row       |
| `main` `pb-` | `16` (64px)                    | Footer breathing room                |
| `<aside>`    | `pt-5 pr-4 pb-5 pl-5`          | 20px top, 16px right, 20px bottom    |

### Sidebar brand row

```jsx
<div className="mb-3"> {/* no divider — divider was removed intentionally */}
  <Link className="inline-flex w-fit items-center gap-[0.55rem] rounded-xl px-[0.7rem] py-[0.4rem]">
    <span className="block size-2 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
    <span className="text-[0.82rem] font-bold tracking-[0.06em] text-ink">MOKARA</span>
  </Link>
</div>
```

### Page breadcrumb row

```jsx
<div className="flex items-center justify-between border-b border-border-soft py-1">
  {/* breadcrumb + star on the left, action icons on the right */}
</div>
```

---

## 6 · Component recipes

All defined in `globals.css` as `@utility` blocks. Use the class names directly
in JSX.

### Button

```html
<button class="btn-base btn-primary">Save</button>
<button class="btn-base btn-ghost btn-small">Cancel</button>
<button class="btn-base btn-ghost btn-danger">Delete</button>
```

| Utility         | Adds                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `btn-base`      | Size, padding, transitions, disabled state (opacity 0.45 + cursor not-allowed) |
| `btn-primary`   | Accent bg, accent shadow, hover darkens + lifts 1px                            |
| `btn-ghost`     | Transparent bg, muted text, strong-border; hover lightens                       |
| `btn-danger`    | Red text + red border (pairs with `btn-ghost`)                                  |
| `btn-small`     | Padding `0.45rem 0.75rem`, font `0.82rem`                                       |

Buttons are never used bare — always pair `btn-base` with one color variant.

### Card / Panel

```html
<div class="card">…</div>           <!-- glass -->
<div class="panel-card">…</div>     <!-- same but no backdrop blur -->
```

Both apply `--radius-card`, `--shadow-card`, `--color-surface`, and
`--color-border-soft`. Use `card` for floating elements (login card, task
composer), `panel-card` for sticky panels (team sidebar).

### Field

```html
<input class="field" />
```

Defines padding, surface-2 background, border-soft, border-radius btn. Focus
state is set globally in `@layer base` (accent border + 4px accent-soft ring).

### Pill

```html
<span class="pill">member</span>
<span class="pill bg-progress-soft text-progress">owner</span>
```

Default `pill` is `pill-bg` + `ink-muted` text. Override bg/text for status
variants — see the task row in `app/(app)/tasks/page.tsx` for examples
(`STATUS_PILL` map).

### Badge

```html
<span class="badge">3</span>
<span class="badge subtle">3/3</span>
```

`badge` = accent bg + white text. `badge subtle` = accent-soft bg + accent text.

### Glass blur

```html
<aside class="glass-blur">…</aside>
```

Standalone `backdrop-filter` for cases that aren't a card (the sidebar).

---

## 7 · Typography

| Element                 | Style                                                        |
| ----------------------- | ------------------------------------------------------------ |
| Page title (`<h1>`)     | `clamp(1.6rem, 4vw, 2.1rem)` · `font-bold` · `tracking-[-0.025em]` · `leading-tight` |
| Section title (`<h2>`)  | `1rem` · `font-bold` · `tracking-[-0.01em]`                 |
| Body                    | `0.95rem` · `font-medium`                                    |
| Small / hint            | `0.78rem` · `font-semibold` · uppercase + `tracking-[0.06em]` for labels |
| Eyebrow                 | `0.78rem` · `font-semibold` · uppercase · `ink-faint` · `tracking-[0.08em]` |

Title uses `clamp()` so it scales smoothly between 1.6rem (mobile) and 2.1rem
(desktop). Eyebrows above titles are the established hero pattern (see
`Mokara › Tasks` pages).

---

## 8 · State conventions

- **Hover on row** → `bg-surface-2`, action icons fade in via `opacity-0 group-hover:opacity-100`.
- **Hover on card / row lift** → `-translate-y-[2px]` + `shadow-lift` + `border-strong`.
- **Disabled button** → handled inside `btn-base` (`:disabled` selector). Don't add manual `opacity-45` outside the button utilities.
- **Focused input** → handled globally in `@layer base` (accent ring).
- **Selected nav link** → `bg-surface-solid text-ink shadow-[0_1px_2px_rgba(15,23,42,0.06),0_0_0_1px_var(--color-border-soft)]` + accent-colored icon.

---

## 9 · Established page patterns

### Linear-inspired list page (`app/(app)/tasks/page.tsx`)

- **Top bar:** breadcrumb row (`py-1`, `border-b`) → filter chips row → status groups
- **Group header:** chevron + name + count, hover-revealed `+` button on right
- **Rows:** `checkbox · priority glyph · short ID · status glyph · title · date · hover actions`
- **Inline add:** per-group `+` opens a focused row at the bottom of the group; Enter saves, Esc cancels; row stays focused for rapid entry
- **Filters:** `Active · Today · This week · Done` chips control which groups/tasks are visible
- **Sort:** `Manual · Priority · Due date` dropdown

### Auth pages (`app/login`, `app/signup`)

```html
<main class="grid min-h-screen place-items-center px-5 py-8">
  <div class="card w-full max-w-[420px] px-7 pt-8 pb-7 text-center">…</div>
</main>
```

- Centered, max-width 420px, generous vertical padding.
- Brand pill at top, then title + subtitle, then form fields, then full-width `btn-primary`, then footer link.

### Glass sidebar (`components/AppShell.tsx`)

- 260px desktop / 280px drawer mobile (slides from left on `<800px`).
- `sticky top-0 h-screen flex flex-col pt-5 pr-4 pb-5 pl-5 border-r border-border-soft glass-blur`.
- Brand row at top, `<nav class="mb-auto">` in the middle, user + logout at the bottom separated by `border-t`.

---

## 10 · Conventions to avoid

- ❌ Hard-coded hex colors (`#6366f1`, `#0f172a`, …) — use the token names.
- ❌ Custom shadow strings — use `--shadow-*` tokens.
- ❌ Per-component CSS files or `style={{ … }}` for layout/spacing.
- ❌ `max-w-[1100px]` on `main` — was removed intentionally to let content fill the column.
- ❌ New `border-b` rules without consulting this doc — currently reserved for: top bar (page-level), sidebar footer (user section).
