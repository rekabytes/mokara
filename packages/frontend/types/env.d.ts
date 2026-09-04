/**
 * Ambient types that the generated `next-env.d.ts` normally supplies — but that
 * file is gitignored (`.gitignore`) and rewrites itself to import
 * `.next/dev/types/routes.d.ts`, which does not exist in a fresh checkout. CI
 * runs `pnpm typecheck` before any `next` command, so the repository has to
 * compile without it.
 *
 * `next/image-types/global` is the part that matters: it is what gives
 * `import shot from "../public/landing/shot-drawer.webp"` a type. Without this
 * file the landing page typechecks on any machine that has run `next dev`, and
 * fails everywhere else — verified by deleting next-env.d.ts and re-running
 * `pnpm typecheck`.
 *
 * Anything else that only the generated file declares must be added here too,
 * rather than by committing next-env.d.ts.
 */
/// <reference types="next" />
/// <reference types="next/image-types/global" />
