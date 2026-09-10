// Billing copy and cap formatting for the settings tiles. Pure functions over
// the `BillingInfo` payload — no React, no fetching.
//
// Two rules live here:
//   - every number rendered in the tile comes from the tier ladder the API
//     returns in `billing.plans` / `billing.caps`, so display and enforcement
//     read the same table and cannot drift. `capNum`/`capGb`/`capMb` map `null`
//     to the infinity glyph, which is how an unlimited cap is written.
//   - `STARTER_PRICE` is the ONE exception: it is a marketing label, not an API
//     value, because no endpoint carries prices. Changing the live Stripe price
//     means changing this constant too.
//
// `timeAgo` here is the settings variant, and it is NOT the same function as the
// one in `app/(app)/tasks/task-format.ts`: this one reads the clock itself,
// that one takes `now` as a parameter so the whole comment thread ages against
// a single tick. Merging them would change behaviour, so it is a deferred
// dedupe, not a move.

import type { BillingInfo } from "@/lib/api";

import { type PlanCaps } from "@/lib/api";

// Single-date display only — no day-index math anywhere near this.
export function fmtMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function timeAgo(iso: string): string {
  const diffS = Math.max(0, Date.now() / 1000 - new Date(iso).getTime() / 1000);
  if (diffS < 60) return "just now";
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

// --- PRD-11 Phase 2 cap display helpers. null = "no cap" (publicCap maps
// Infinity to null server-side); undefined = not loaded yet. "∞" is
// typography, not an emoji. ---
export function capWord(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function capNum(n: number | null | undefined): string {
  return n === undefined ? "—" : n === null ? "∞" : String(n);
}

export function capGb(bytes: number | null | undefined): string {
  if (bytes === undefined) return "—";
  if (bytes === null) return "∞";
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

export function capMb(bytes: number | null | undefined): string {
  if (bytes === undefined) return "—";
  if (bytes === null) return "∞";
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

// Marketing label for the Starter price — must match the live Stripe price
// (USD 4/mo, lookup_key starter_monthly). One place; update alongside the PRD.
export const STARTER_PRICE = "$4";

// The upgrade checklist. Numeric rows come from the tier ladder (never
// hardcoded); if an older backend hasn't answered with `plans` yet, the two
// marketing perks still carry the pitch on their own.
export function pitchRows(billing: BillingInfo): string[] {
  const starter: PlanCaps | undefined = billing.plans?.starter;
  const rows: string[] = [];
  if (starter) {
    rows.push(`${capNum(starter.members)} members per team`);
    rows.push(`${capNum(starter.teams)} team workspaces`);
    rows.push(`${capGb(starter.storage_bytes)} storage`);
    rows.push(`${capMb(starter.file_bytes)} per file`);
  } else {
    rows.push("More members, workspaces, and storage");
  }
  rows.push("Priority support");
  rows.push("Custom workspace logo");
  return rows;
}
