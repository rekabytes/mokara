---
name: mokara-client-design
description: Design or change Mokara's signed-in client dashboard, including tasks, analytics, teams, settings, drawers and shared app components. Use the current client UI as the benchmark; excludes the operator admin console and public marketing pages.
---

# Mokara client design

Extend the existing client product rather than inventing a new visual direction. The owner selected the current signed-in frontend as the design benchmark. Its identity is a calm, compact task workspace: indigo accents, cool translucent surfaces, softly rounded controls and restrained depth.

## Inspect the actual benchmark

Resolve paths below from the Mokara repository root. Read the nearest existing component before designing its sibling:

- `packages/frontend/app/globals.css`: the base `@theme`, utilities and body styles are the client tokens. `.public-site` overrides belong to public pages, not the dashboard.
- `packages/frontend/components/AppShell.tsx` and `PageHeader.tsx`: shared navigation, mobile drawer, gutters and compact breadcrumb chrome.
- `packages/frontend/app/(app)/tasks/Board.tsx`, `TaskRow.tsx`, `chrome.tsx` and `chips.tsx`: density, grouped rows, filters, selection, menus and chips.
- `packages/frontend/app/(app)/analytics/page.tsx`: compact chart panels; `settings/settings-chrome.tsx` and `settings/settings-view.tsx`: account tiles; `teams/[id]/LayersPanel.tsx`: team layers.
- `packages/frontend/lib/motion.ts`: shared motion constants and variants.
- `docs/design/system.md`: supporting recipes. Current implementation wins when prose is stale; do not copy an obsolete recipe blindly.

These paths describe the benchmark inspected on 2026-10-11, not a frozen template. Read current values before making changes.

## Visual decisions

- Preserve the client system font stack declared on `body`. Self-hosted public-page fonts being available at the root does not make them the dashboard font. Do not import admin Instrument Sans/Plex typography or marketing Fraunces headings.
- Match the neighboring component's hierarchy: task titles are about `0.92rem` at 500; navigation about `0.92rem` at 500; compact section labels commonly 600. Body copy and metadata do not need blanket bold. Keep purposeful existing emphasis, including the brand, instead of applying admin's all-regular convention globally.
- Reuse base tokens: ink `#0f172a`, muted `#64748b`, indigo accent `#6366f1`, white surfaces at 0.72/0.55 opacity, and soft slate borders. The existing body has a subtle cool gradient wash. Preserve it; do not substitute cream, admin orange, or marketing navy sections.
- Reuse `radius-card` (18px), `radius-btn` (11px), `radius-icon` (10px), and full-round chips where their existing counterparts use them. Preserve subtle card shadows and glass blur; do not flatten the client into admin's square ruled panels.
- Use Tailwind v4 tokens and existing `card`, `panel-card`, `field`, button and pill recipes where appropriate. Route-local chip/icon primitives are valid counterparts; do not force every compact control into a full-size button. Put genuinely new shared values in the token source.

## Composition and interaction

- Keep the 260px desktop sidebar, 280px mobile drawer and existing 800px breakpoint. Reuse `AppShell` and the single `PageHeader`; preserve its `text-[0.92rem]` and size-8 bell.
- Tasks stay a dense grouped list with filter chips and inline actions, not a dashboard of oversized metric cards. Match the existing row spacing, identifiers, status/priority glyphs and drawer workflow.
- Analytics stays chart-focused; settings uses the existing tile grid; team pages retain their layer/member composition. Consistency means shared chrome and tokens, not identical page layouts.
- Reuse hand-drawn SVG icons and accessible labels. Keep route-private drawings local until truly shared. Preserve keyboard interactions, errors, loading/empty states, tour hooks and all existing data.
- Source Framer Motion timing/variants from `lib/motion.ts`. Use presence-owned exits, `layout="position"` for lists and retain portal positions during exit. Keep heatmap cells/track and `ChipShell` free of motion. Respect reduced motion; decorative WebGL is not a default dashboard addition.
- Existing intentionally inactive controls do not authorize new behavior. A design task should not silently wire them up.

## Review

Follow repository instructions for checks and owner-managed servers. Inspect existing authenticated UI in the browser when available; if it redirects to login, use source evidence and state that visual review is limited. Do not create an account or invent signed-in verification. Check 1280/1440/1600/1920 layouts plus narrow mobile sizes, overflow, contrast on composited glass backgrounds, focus and enabled/disabled controls. Preserve the current visual language while fixing concrete accessibility defects.

This project-specific benchmark takes precedence over generic advice to replace system fonts, avoid indigo, or choose a radically different aesthetic. Apply `mokara-admin-design` only to `packages/admin`; public marketing retains its separate design.
