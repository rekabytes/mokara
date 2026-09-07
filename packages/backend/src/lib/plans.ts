// PRD-11 Phase 1.1 — the ONE table that says what each tier gets. Caps are
// read from here by lib/entitlements.ts and by anything that displays a
// limit; nothing else in the codebase may hardcode a number. Phase 2 adds
// price identifiers to the same map (§7 2.1).
//
// Values are the PROPOSED ladder in PRD-11 §2/§5, signed off in Phase 0.

export const PLAN_IDS = ["free", "starter", "pro", "ultra"] as const;
export type Plan = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  /** Members one workspace may hold. */
  members: number;
  /** Team-kind workspaces one account may lead (personal containers are free). */
  teams: number;
  /** Total stored bytes per workspace. */
  storageBytes: number;
  /** Bytes accepted for a single upload. */
  maxFileBytes: number;
};

// Binary multiples, deliberately: object storage bills decimal GB, so this
// keeps the enforced quota at or under what the tier advertises (1 GiB ≥ 1 GB
// would over-deliver; these are ceilings we pay for, not marketing numbers).
const KiB = 1024;
const MiB = 1024 * KiB;
const GiB = 1024 * MiB;

/** Infinity = no cap. Every row is Infinity in every column. */
export const UNLIMITED: PlanLimits = {
  members: Infinity,
  teams: Infinity,
  storageBytes: Infinity,
  maxFileBytes: Infinity,
};

const FREE: PlanLimits = { members: 3, teams: 1, storageBytes: 1 * GiB, maxFileBytes: 25 * MiB };
const STARTER: PlanLimits = {
  members: 8,
  teams: 3,
  storageBytes: 10 * GiB,
  maxFileBytes: 100 * MiB,
};
const PRO: PlanLimits = { members: 25, teams: 10, storageBytes: 50 * GiB, maxFileBytes: 250 * MiB };
const ULTRA: PlanLimits = {
  members: Infinity,
  teams: Infinity,
  storageBytes: 200 * GiB,
  maxFileBytes: 1 * GiB,
};

// Plain lookup instead of Record<Plan, PlanLimits> indexing: `plan` arrives as
// a database TEXT, and a lookup by string with an explicit fallback beats a
// cast through the key type.
export function limitsFor(plan: string): PlanLimits {
  switch (plan) {
    case "starter":
      return STARTER;
    case "pro":
      return PRO;
    case "ultra":
      return ULTRA;
    default:
      // Unknown value reads as the TIGHTEST tier, never the loosest: a
      // database restored from before PRD-11, or a hand-edited row, must not
      // accidentally be unlimited. users_plan_check makes this unreachable in
      // normal operation.
      return FREE;
  }
}

/**
 * Infinity is a code-side sentinel; JSON has no such literal, so anything
 * crossing to the client reports `null` for "no cap".
 */
export function publicCap(cap: number): number | null {
  return Number.isFinite(cap) ? cap : null;
}

/**
 * PRD-11 Phase 2: the ONLY price→plan trust boundary. The webhook (and the
 * sync endpoint) resolve a subscription's plan from its price's lookup_key;
 * a price not listed here — the account's OTHER products, anything hand-
 * minted in the Dashboard — resolves to no plan and grants nothing. Adding a
 * tier later = one entry here + one env price id, nowhere else.
 */
export const PLAN_BY_PRICE_LOOKUP_KEY: Record<string, Plan> = {
  starter_monthly: "starter",
};
