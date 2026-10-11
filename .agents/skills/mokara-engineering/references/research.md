# Engineering research

Reviewed 2026-10-11. Official APIs inform implementation; the stricter no-effect-animation and official-utility-first rules are the owner's project policy.

## State

[Jotai hooks](https://jotai.org/docs/core/use-atom) document separate reading and writing hooks and the importance of stable atom identity. Use them to express subscriptions precisely; domain atom definitions are still application code.

[Storage utilities](https://jotai.org/docs/utilities/storage) provide persistence and storage subscriptions. Stored JSON needs validation and SSR needs special care because browser storage is unavailable on the server. Prefer these utilities to effect-driven storage mirroring.

[Reset utilities](https://jotai.org/docs/utilities/resettable) supply resettable atoms and reset actions. [Async utilities](https://jotai.org/docs/utilities/async) offer `loadable`, `unwrap` and observable integration. `loadable` exposes loading/data/error states; `unwrap` supplies synchronous fallback behavior but does not itself handle errors. Neither is a complete server-cache/retry framework. Feed failures into the shared error policy.

## Effects

[React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) distinguishes external synchronization from calculations and user interactions. Derive values during rendering and perform interaction-specific work in handlers. [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects) explains cleanup and development remount behavior. Mokara's last-choice rule still permits necessary external synchronization; moving an effect elsewhere does not remove the underlying synchronization problem.

## Motion

[AnimatePresence](https://motion.dev/docs/react-animate-presence) manages exit animations for removed children. [Layout animations](https://motion.dev/docs/react-layout-animations) provide declarative layout transitions. Use these mechanisms instead of scheduling unmounts in effects.

[MotionConfig](https://motion.dev/docs/react-motion-config) and [accessibility](https://motion.dev/docs/react-accessibility) explain reduced-motion configuration. Transform/layout motion can be disabled while other transitions remain. The app should choose suitable reduced alternatives rather than assume every animation disappears. Keep the existing `framer-motion` dependency; documentation's newer import spelling is not a migration requirement.

## Errors and narrowing

[TypeScript catch variables](https://www.typescriptlang.org/tsconfig/useUnknownInCatchVariables.html) supports unknown catches, and [narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) documents checks before using uncertain values. Type declarations alone cannot validate API JSON.

[Hono error handling](https://hono.dev/docs/api/hono#onerror) provides a central unexpected-error boundary. [OWASP error handling](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html) recommends separating safe responses from diagnostic details. Apply this to the existing error chain, rather than introducing another handler. The production reference covers operational implications.
