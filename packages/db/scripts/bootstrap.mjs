// Database bootstrap — run by `pnpm dev` (and dev:backend / dev:frontend)
// before the servers start, and the same two steps the backend container's
// start.sh runs in production.
//
// Contract (deliberate, do not change to `migrate dev` or `db push`):
//   - the database ONLY ever changes by applying committed migration SQL
//     files, forward-only, via `prisma migrate deploy`;
//   - `migrate deploy` applies pending migrations and SKIPS already-applied
//     ones — re-running is always safe;
//   - editing schema.prisma alone is inert — it only updates the client/types
//     after `prisma generate`, and never touches the database;
//   - a failed migration fail-closes the whole step (exit ≠ 0) so the servers
//     never start against a schema they do not have. Nothing is deleted.
import { spawnSync } from "node:child_process";

const step = (label, args) => {
  console.log(`→ db: ${label}…`);
  const res = spawnSync("prisma", args, { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(
      `✗ db: ${label} failed — forward-only, nothing was deleted. Fix the failing migration and re-run pnpm dev.`
    );
    process.exit(res.status ?? 1);
  }
  console.log(`✓ db: ${label} — done`);
};

step("applying pending migrations (already-applied ones are skipped)", ["migrate", "deploy"]);
step("generating the prisma client", ["generate"]);
