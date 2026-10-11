---
name: mokara-admin-design
description: Design or change Mokara's operator admin console pages and shared UI in packages/admin. Preserve the editorial console design; excludes the signed-in client frontend and public marketing pages.
---

# Mokara admin design

Extend the editorial operations console established in commit `9258dbd`. The owner requested a clean, consistent admin redesign and explicitly objected to unnecessary bold text. Treat the shared console design as the benchmark for all admin views, including login and signed-out screens.

## Sources

Resolve paths from the Mokara repository root:

- `packages/admin/src/assets.ts`: shared CSS tokens, controls, layout, responsive rules and client rendering.
- `packages/admin/src/pages.ts`: masthead, numbered navigation, page shell and auth screens.
- `packages/admin/src/fonts.ts`, `fonts/`, and `index.ts`: vendored fonts and fixed same-origin asset routes. Retain font licenses, module-relative loading and self-only CSP.

Read the current relevant sections rather than introducing parallel component styles. This is a Hono HTML/CSS/JS console, not a React/Tailwind app.

## Visual identity

- Use self-hosted Instrument Sans for content and IBM Plex Mono 400 for small labels, navigation numbers, timestamps and operational metadata.
- Use regular 400 for headings, metrics, navigation, table headers/links, controls and badges. Brand 500 is the established exception. Create hierarchy with size, spacing, contrast and placement rather than bolding every label.
- Reuse CSS variables: cool gray background `#f4f5f5`, white panels, graphite text `#232626`, muted `#636b6b`, burnt-orange accent `#a63e24` and subtle rules. Orange is a restrained navigation/state accent, not a full-page wash. Status colors retain their semantic meaning.
- Keep 2px panel and 4px control radii, thin borders and quiet surfaces. Avoid heavy shadows, cream backgrounds, pill-shaped panels or importing the client's indigo glass styling.
- Preserve the masthead, numbered console index and generous title area. Summary metrics form a ruled strip. Overview uses its asymmetric operational grid; directories and billing group toolbar, data and pager into one panel; detail pages group related facts. Auth screens use a centered restrained card.

## Controls and data

- Use shared button styling for actions such as Filter, Clear filters, Refresh, Details, pagination and Sign out. Clear filters must look actionable, not like an unstyled stray link.
- Keep native semantics: real buttons for actions, links for navigation, labeled forms and keyboard-operable detail disclosures. Preserve clear focus, hover, disabled and expanded states.
- Preserve every existing field and support action, table/detail disclosures, filters, URL state, pagination and refresh behavior. Differentiate zero, unavailable, stale and error data honestly. Design changes must not alter plan grants, monitoring meaning or auth.
- Keep escape handling, CSP and data attributes required by the existing renderer. Reuse shared rendering helpers instead of copying a page-specific toolbar.
- Keep motion short and restrained, matching existing entry reveals and reduced-motion rules. No WebGL or continuous decorative animation in the operations console.

## Review

Follow repository rules for owner-managed servers and verification. Review all affected pages and shared states, checking narrow mobile widths and 1280/1440/1600/1920 desktops. Pay attention to long labels, table scrolling, wrapped audit filters, focus, clear actions and authentic unavailable/empty states. Use sample data explicitly when previewing fixtures, and do not claim live verification from them.

This skill is scoped to admin. Use `mokara-client-design` for the customer dashboard; do not propagate this console's typography, orange palette or squared geometry into the client.
