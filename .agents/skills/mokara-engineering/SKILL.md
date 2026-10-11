---
name: mokara-engineering
description: Implement or review Mokara TypeScript and React behavior using official Jotai state utilities, minimal effects, declarative Framer Motion and unified typed error handling. Apply to feature logic and fixes; architecture and visual direction have separate project skills.
---

# Mokara engineering

Read `.pi/AGENTS.md` and the nearest implementation first. These are owner-selected engineering rules, not a reason to rewrite working features outside the request. Use `mokara-architecture` for ownership decisions and the appropriate design skill for styling. Read [research.md](references/research.md) for sources; read [production.md](references/production.md) when changing production-sensitive behavior.

## Jotai: official primitives and utilities

Use Jotai for shared client/application state. Use official `jotai` and `jotai/utils` APIs instead of building custom stores, subscription registries, persistence hooks, reset frameworks or loading-state utilities. Domain-specific atoms and actions remain necessary; “no custom” means do not reimplement library capabilities.

| Need                                        | Official API to consider                 |
| ------------------------------------------- | ---------------------------------------- |
| Read an atom without writing                | `useAtomValue`                           |
| Write without subscribing to its value      | `useSetAtom`                             |
| Read and write                              | `useAtom`                                |
| Derived state                               | Read-only derived `atom`                 |
| Coordinated state action                    | Writable/action `atom`                   |
| Persist a UI preference                     | `atomWithStorage`, `createJSONStorage`   |
| Resettable state                            | `atomWithReset`, `useResetAtom`, `RESET` |
| Render async state without Suspense         | `loadable`                               |
| Unwrap an async atom with a chosen fallback | `unwrap`                                 |
| Existing observable integration             | `atomWithObservable`                     |

Choose only what the feature needs. Use installed APIs; verify signatures in official docs or installed declarations before adopting one. Do not install community extensions as though they were built-in utilities.

Keep atom identity stable and definitions at module scope where appropriate. Derive totals, filters and dependent selections instead of storing duplicate values and synchronizing them in effects. Temporary form/menu state can remain `useState`; do not globalize every field.

Preserve Mokara's default-store client model and existing session actions. Do not introduce a separate Provider/store that splits readers from imperative writers. Never place request-specific authenticated data in a process-global server store. Do not persist credentials or tokens in browser storage. Validate persisted values and account for SSR/hydration; a storage generic is not runtime validation. Official utilities may manage lifecycle internally; that does not justify duplicating their behavior in application effects.

## Effects: last choice for external synchronization

Before adding `useEffect`, try rendering/derived atoms for calculations, event handlers or atom actions for user-triggered work, and existing framework/library facilities for lifecycle. Do not use effects for derived state, prop mirroring, form submission, chained state transitions, persistence already handled by Jotai or animations.

Use an effect only when an external system genuinely needs synchronization and the alternatives do not meet the requirement: for example an existing SSE subscription, browser event listener or necessary external lifecycle integration. State why it is needed and why the simpler alternative does not fit in a comment. Declare real dependencies, clean up resources, handle cancellation/stale responses and tolerate development remounts. Do not suppress dependency rules or move the same unnecessary effect into `onMount`, `useLayoutEffect` or a custom hook to bypass this rule. Preserve intentional existing boot semantics during scoped work.

## Animation: Framer Motion, without effects

Use the installed `framer-motion` package. Current Motion documentation may show `motion/react`; do not change dependencies/import paths solely to copy an example.

- Drive animations with render state, `motion.*`, named variants, `initial`, `animate`, `exit`, gestures and `whileInView` as appropriate.
- Use `AnimatePresence` for exit lifetimes and stable keys for identity. No effect-started animations, timeout-based unmount delays, custom frame loops or `useLayoutEffect` animation rigs.
- Reuse timings and variants from `frontend/lib/motion.ts`. Preserve `MotionProvider`; reduced motion disables transform/layout motion but does not automatically eliminate every opacity/color transition. Choose static/reduced alternatives where needed.
- Follow existing `layout="position"` list rules and portal placement ownership; keep heatmap track/cells and `ChipShell` outside motion. Avoid animating a huge layout subtree for a small control change.

Existing decorative WebGL is a separate implementation; this rule is not authorization to replace it or add new GPU effects. Do not transplant React/Motion into the plain-HTML admin console merely to satisfy a client animation convention.

## One typed error path per runtime

Always use the established unified handler rather than a private catch-to-message helper per component. “Unified” means one contract and classification policy, with separate server/client adapters; do not import React/router code into backend or admin.

Frontend flow: `lib/api.ts` owns transport failures → `lib/errors.ts` owns `ApiError`, runtime narrowing, `ERROR_RULES` and normalization → `hooks/useAsyncError.ts` owns action-error routing/state → `components/ErrorBanner.tsx` owns presentation. `FatalError`, `app/error.tsx` and `global-error.tsx` handle render failures; an error boundary does not replace async-event handling.

For a new failure, define a stable backend code/status and safe message, add its central rule, then consume the normalized result. Known validation messages may be exposed only by an explicit `serverSays` rule. Unexpected exceptions, raw provider bodies and stack traces stay out of UI copy. Use a safe generic or contextual fallback and preserve the original cause for controlled diagnostics. Unknown codes should still receive meaningful HTTP fallback classification.

Treat catches and parsed JSON as `unknown`. Check field types and status validity before claiming an error envelope. Look up codes as own registry entries, not prototype properties. Classify fetch/network failure at the transport boundary; an arbitrary `TypeError` may be a programming error. Keep code, status, kind, action and retryability distinct.

Use `run` for API actions and `manualError` for local validation; handle its failure result before writing success state. Roll back optimistic changes on failure and reset pending state reliably. Preserve typed `null`/failure semantics of existing callers; do not silently replace them with an incompatible result API. No swallowed failures, empty-success fallbacks or automatic mutation retries without idempotency. Deliberate best-effort behavior needs an explicit documented policy.

Backend expected failures retain `{ error, message }`; central `app.onError` provides a safe unexpected-error fallback. Reuse validation, constraint matching and logger helpers. Keep details in controlled server diagnostics, with credentials, cookies, OAuth codes and sensitive bodies redacted. The admin adapter preserves the same API meaning without leaking upstream internals or reporting failures as success.

## Type safety and verification

Never use `as any`, explicit `any`, double assertions to bypass types, non-null assertions or TypeScript suppression comments. Prefer concrete types, discriminated unions, schema validation, `instanceof`, property/type guards and `satisfies`. A boundary assertion does not validate external data; narrow before accessing it.

Verify meaningful behavior: malformed error bodies, unknown/prototype codes, safe copy, session routing, retry classification and optimistic failure recovery when changed. Check atom identity/store ownership, persisted-state hydration and reduced-motion behavior for relevant features. Run permitted typechecks/lint/format and focused tests; follow owner-managed servers and CI builds. This skill does not authorize committing, pushing or deploying.
