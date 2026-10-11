# Architecture research

Reviewed 2026-10-11 against Mokara's current pnpm workspace, Next.js App Router, Hono and Prisma implementation. These are primary sources. Recommendations below combine their guidance with local constraints; they are not mandates from those frameworks.

## Next.js: organize by actual ownership

[Project structure](https://nextjs.org/docs/app/getting-started/project-structure) permits safe colocation of implementation files under route segments and presents multiple organizational approaches. Route groups organize routes without adding URL segments; private folders can opt a subtree out of routing.

**Mokara application:** retain route-owned components/helpers beside their consumers and promote genuinely shared code. Existing `(app)`, `(legal)` and `(marketing)` groups express distinct surfaces. Neither a universal `features/` directory nor a wholesale move under `src/` is required. Adding or moving framework-reserved files can change routes, so file moves need route review.

## Next.js: module boundaries affect the bundle

[Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) describes server rendering defaults, interactive client boundaries, serializable props and the inclusion of imports beneath a client boundary in the client bundle.

**Mokara application:** use small interactive components where appropriate, inspect transitive imports, and keep server credentials out of browser code. The existing backend remains the business API; the ability to fetch from a Server Component does not justify bypassing its authorization or rebuilding its services inside Next.js.

## Hono: preserve route inference and composition

[Best practices](https://hono.dev/docs/guides/best-practices) recommends composing larger applications with `app.route()` and generally keeping handlers beside path definitions to preserve inferred path types. It also documents typed handler factories when extraction is needed.

**Mokara application:** continue route groups plus focused helpers. Split domain logic when it has an independent responsibility, rather than adding forwarding controllers everywhere. This recommendation does not prohibit service functions or imply that every handler must remain large.

## pnpm: explicit workspace boundaries

[Workspaces](https://pnpm.io/workspaces) documents `pnpm-workspace.yaml` and the `workspace:` protocol, which requires local workspace resolution rather than silently using a registry package.

**Mokara application:** retain the five package boundaries and intentional workspace dependencies. Additional packages should represent real ownership/reuse, not arbitrary file categories. Workspace tooling provides linking; it does not itself prevent dependency cycles or enforce architectural boundaries.

## Prisma: transaction scope is an architectural concern

[Transactions](https://www.prisma.io/docs/orm/fundamentals/transactions) covers atomic operations, concurrency, idempotency and the risks of long interactive transactions, including external network requests during them.

**Mokara application:** keep atomic DB changes together and integration calls outside the transaction. The existing GitHub inbox/outbox is a local solution for durable retry and reconciliation; Prisma documentation does not prescribe that exact implementation. Do not introduce an outbox for every ordinary synchronous mutation.

## Resulting recommendation

Use the existing monorepo with cohesive features inside each application and explicit infrastructure boundaries. Colocation makes ownership visible; small shared modules reduce real duplication. Folder names alone do not enforce authorization, acyclic dependencies or transaction correctness, so review those behaviors alongside placement.

This research adds guidance, not a refactor plan. Revisit the recommendations if deployment boundaries, team ownership or demonstrated dependency problems change. Do not introduce microservices, a new state library, a generic repository abstraction or architecture tooling without a concrete task that benefits from it.
