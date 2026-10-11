# Frontend architecture

The frontend keeps its existing Next.js route groups, default-store Jotai state,
same-origin API proxy, shared transport/error adapters and client design. This
refactor changes module ownership, not URLs, wire contracts or application policies.

## Ownership

| Owner                 | Modules and responsibilities                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings              | ProfileTile, PasswordTile and DevicesTile; use-settings-devices and use-settings-billing own external reads/actions. SettingsView composes the grid and shared action-error banner.                                                     |
| Tasks                 | use-task-board owns the server snapshot and SSE subscription; use-task-members writes the existing member atom; use-task-repositories owns personal repository eligibility. Existing mutation ordering and task drafts remain separate. |
| Task view preferences | task-view.ts owns the existing module-level Jotai atoms beside Tasks; moving the module does not introduce another store or change persistence.                                                                                         |
| Task comments/editing | use-task-comments owns cancellation, optimistic changes and thread guards. CommentsSection owns its list DOM and timestamp clock. CommentComposer owns drafts/uploads; DescriptionField owns inline description editing.                |
| Task walkthrough      | TourOverlay and tour-geometry live beside Tasks. Shared onboarding gates, step definitions and contracts remain in lib/onboarding.ts because AppShell also consumes them.                                                               |
| Analytics             | use-analytics-data owns independent reads, abort controllers and retries. DistributionCard, TaskProgressCard, KpiProgressCard and ActivityCard compose the screen. Pure date/series calculations live in analytics-model.ts.            |
| Pricing               | pricing-data.ts lives beside its marketing route.                                                                                                                                                                                       |
| Server helpers        | Backend runtime URL configuration lives in lib/backend-url.server.ts. Signed ingress assertions live in app/api/[...path]/auth-proxy.server.ts.                                                                                         |
| Legal metadata        | lib/legal-links.ts contains public document metadata. lib/legal.server.ts reads deployment/operator configuration; auth links import only the public metadata.                                                                          |

Shared components, hooks and libraries must not depend on route-private modules.
Route-private code may depend on shared modules, but must not import another route's
internals. A second real consumer is a reason to promote a coherent module.

## Automated boundary checks

Run `pnpm --filter @mokara/frontend architecture:check`. The same check runs after
ESLint through the frontend lint command, so the existing CI lint gate enforces it.
It uses the already-installed TypeScript parser; no new dependency is required.

The checker rejects:

- Runtime import cycles and unresolved local source imports.
- Imports of backend/admin/DB/Redis packages or relative paths outside the frontend.
- Shared modules importing route internals, or routes importing another route's internals.
- Client graphs reaching `.server.*` modules, Node builtins, Next server APIs or
  modules reading private/computed environment values.

It follows static imports/re-exports, literal dynamic imports and literal require
calls. Type-only imports obey ownership rules without adding runtime edges. Tests,
scripts, generated files and assets are excluded from the production graph. This is
an explicit source-level guard, not a complete bundler/security analysis; computed
module loading, new aliases or environment indirection require review and an update
to the checker when introduced. `.server.*` is enforced by this checker, not a Next.js
reserved filename convention.

Six fixture-based regression tests exercise allowed boundaries and deliberate
violations. The existing frontend suite also covers request contracts, typed errors,
optimistic recovery, mutation ordering, onboarding gates and keyboard behavior.

## Verification and acceptance

Run workspace typechecks, frontend lint/architecture checks, formatting and the
isolated frontend suite before pushing. Keep server startup and builds owner/CI
managed. After deployment, browser acceptance should cover:

- Settings profile/password/username changes, devices and billing actions.
- Task workspace switching, live updates/reconnects, creation, drawer editing and comments/replies/files.
- Analytics cards, independent retries, series controls and month scrolling.
- Onboarding and public pricing/legal/auth navigation.

The backend and admin architecture have not been restructured by this frontend work.
