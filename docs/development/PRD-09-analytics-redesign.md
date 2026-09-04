# PRD-09 — Analytics Redesign: Range Control and Capped Lists

## 1. Goal

The analytics page grows without limit: the progress heatmap renders one row
per task and the KPI card one row per KPI, so a busy container stretches the
page for thousands of pixels. This PRD implements the approved mockup
(`docs/design/analytics-redesign-mockup.html`, commit `6d499a9`): a 7-row
capped scrollable heatmap, the same cap on the KPI card, and a card order
that leads with the flagship. (The mockup's shared range control was dropped
by owner decision after implementation — see §3.)

## 2. Scope — UI only

No API changes. `GET /teams/:id/analytics` already accepts `?range=<1–92>`;
`/teams/:id/progress` and `/teams/:id/kpis/progress` already return complete
payloads, so "scroll for more" is instant local scrolling — the cap is a
viewport, not a query.

## 3. Range control — dropped

The mockup proposed a head-mounted 7/14/30/92 segmented control driving the
chart window. The owner removed it after seeing it implemented: **the chart
stays fixed at the trailing 14-day window** (the originally approved
behavior, every day ticked), and the heatmap stays full-year. Nothing was
built to keep — the control was a pure UI state; the API's `?range=` support
remains for the future.

## 4. Card order

Distribution → Progress heatmap → KPI progress → Activity chart. The flagship
moves up from second-to-last; summary → detail reading order. Pure DOM
reorder, no styling changes.

## 5. The capped heatmap

- The track scroller becomes a **both-axis scroll container** with
  `max-height = AXIS_HEIGHT + 7 × ROW_H` (44 + 266 = 310px). The vertical
  scrollbar lands on the card's right edge, always visible.
- The month/day axis row becomes `sticky top-0` (its blank corner cell is
  already sticky-left; it now pins both ways). Task titles are already
  sticky-left per row — dates and titles stay readable while panning either
  way.
- When the payload exceeds 7 rows, a **white bottom fade + "N more tasks
  below" pill** overlays the scroller's visible bottom (absolutely positioned
  sibling, `pointer-events-none` — it must not intercept cell hover or the
  drag-scroll). The pill is static while overflowing; no scroll listeners in
  v1.
- Header gains the task count ("16 tasks").
- Row order is the payload's own `dueDate asc` — nearest deadline first, so
  the capped view already leads with the most urgent work. No re-ranking.
- Horizontal behaviors unchanged: drag-scroll, jump-to-month dropdown,
  center-on-today, hover popover. They drive `scrollLeft` / mouse position
  only.

## 6. The capped KPI card

Same pattern, lighter: the list gets `max-height` of 7 rows, `overflow-y-auto`,
fade + "N more KPIs below" pill, count in the header. The card is never
horizontally scrolled, so the pill simply centers.

## 7. Decisions made (owner-approved via the mockup)

- Scroll-within-card, not a "Show all" button; 7 rows is the body height for
  both capped lists.
- Card order as mocked. Range control mocked but removed by owner decision
  after implementation.
- Row order stays payload order (`dueDate asc`).
- No virtualization: a scroll container over memoised rows is enough at
  realistic scale (teams cap at 3 members).

## 8. Build order

1. DOM reorder of the four cards.
2. Heatmap cap: scroller classes, sticky axis, fade/pill, count.
3. KPI cap: scroller, fade/pill, count.
4. Gates; mockup diffed against the implementation.
