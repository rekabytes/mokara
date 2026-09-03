import { Prisma } from "@mokara/db/prisma/generated/client";

// Prisma 7 with the pg DRIVER ADAPTER no longer fills `meta.target` for
// constraint violations (it did in the classic client). The database's own
// words — index name for a unique violation, RAISE EXCEPTION text for a
// trigger — arrive nested instead:
//
//   meta.driverAdapterError.cause.originalMessage
//     'duplicate key value violates unique constraint "team_invitations_team_pending_unique"'
//
// while `error.message` is Prisma's generic rewrite ("Unique constraint failed
// on the fields: (`team_id`, `invitee_username`)"), which does NOT contain the
// index or trigger name. Matching on `meta.target` therefore silently never
// fires and the request 500s instead of answering with its proper 409.
//
// So: flatten everything the adapter gave us into one lowercase haystack and
// match against that.

export type DbErrorInfo = {
  /** Prisma error code (`P2002`, `P0001`, …) — empty for non-Prisma throws. */
  code: string;
  /** Postgres SQLSTATE when the adapter exposed one. */
  sqlState: string;
  /** Constraint/index/trigger name + original + rewritten messages, lowercased. */
  text: string;
};

export function dbErrorInfo(e: unknown): DbErrorInfo {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) {
    const msg = e instanceof Error ? e.message : String(e);
    return { code: "", sqlState: "", text: msg.toLowerCase() };
  }

  const meta = e.meta as
    | {
        target?: string[] | string;
        driverAdapterError?: {
          cause?: { originalMessage?: string; originalCode?: string | number };
        };
      }
    | undefined;

  const target = Array.isArray(meta?.target) ? meta.target.join(".") : (meta?.target ?? "");
  const cause = meta?.driverAdapterError?.cause;
  const original = cause?.originalMessage ?? "";
  const sqlState = cause?.originalCode != null ? String(cause.originalCode) : "";

  return {
    code: e.code,
    sqlState,
    text: `${target} ${original} ${e.message}`.toLowerCase(),
  };
}

/** Unique violation on a specific index/constraint name. */
export function isUniqueViolation(e: unknown, constraint: string): boolean {
  const info = dbErrorInfo(e);
  return (
    (info.code === "P2002" || info.sqlState === "23505") &&
    info.text.includes(constraint.toLowerCase())
  );
}

/**
 * Failure raised by the `enforce_max_team_members` trigger
 * (`RAISE EXCEPTION 'team_full' USING ERRCODE = 'P0001'`).
 */
export function isTeamFull(e: unknown): boolean {
  const info = dbErrorInfo(e);
  return info.code === "P0001" || info.text.includes("team_full");
}
