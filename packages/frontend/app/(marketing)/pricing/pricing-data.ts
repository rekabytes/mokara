// The public pricing ladder — advertising copy, not enforcement.
//
// Three places hold a piece of this truth, and they must agree:
//   · docs/development/PRD-11-subscription-plans.md §2 (tier table), §4 (what
//     each tier adds) and §5 (storage quotas) — the owner-approved source for
//     every value below;
//   · packages/backend/src/lib/plans.ts — the ONE table that enforces caps;
//   · the live Stripe price (Starter: USD 4/mo, lookup_key `starter_monthly`).
//     Prices exist nowhere in the repo, so `$4` here is a label, not a read.
//
// Deliberately NOT fetched from the API: /settings shows a signed-in user's
// LIVE caps from GET /me/billing, while this page advertises the ladder to
// anonymous visitors and must render from the HTML — no fetch, no spinner,
// shareable. That trade is why this file names its sources instead of deriving.
//
// Pro and Ultra are specced in the PRD but not minted on Stripe, so they are
// published as the "later" strip with no purchase path — never a CTA.

export type Capacity = { label: string; value: string };

// Display-only estimate, manually maintained; never used by Stripe checkout.
// BNM USD/MYR display, 14 October 2026: https://www.bnm.gov.my/exchange-rates
export const MYR_ESTIMATE = { rate: 4.082, asOf: "14 October 2026" };

export function estimatedMyr(monthlyUsd: number): string {
  return `≈ RM ${new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(monthlyUsd * MYR_ESTIMATE.rate)} / month`;
}

export type Tier = {
  id: string;
  name: string;
  /** The price line. "Free" is a price, not a plan name. */
  price: string;
  monthlyUsd: number | null;
  cadence: string | null;
  tagline: string;
  capacity: Capacity[];
  /** Header for the list below — what this tier adds to the one before it. */
  addsLabel: string;
  adds: string[];
  featured: boolean;
};

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "Free",
    monthlyUsd: null,
    cadence: null,
    tagline: "A real workspace for up to three people, with nothing held back.",
    capacity: [
      { label: "Members per team", value: "3" },
      { label: "Workspaces", value: "personal + 1 team" },
      { label: "Storage per account", value: "1 GB" },
      { label: "Per file", value: "25 MB" },
    ],
    addsLabel: "Everything Mokara does today",
    adds: [
      "Subtasks and checklists",
      "Due-soon reminders, in-app",
      "File attachments on tasks and comments",
      "Projects, weighted KPIs, 14-day analytics",
    ],
    featured: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: "$4",
    monthlyUsd: 4,
    cadence: "/ month",
    tagline: "Small real teams — the same product, with room to grow.",
    capacity: [
      { label: "People across owned workspaces", value: "8, including you" },
      { label: "Workspaces", value: "personal + 3" },
      { label: "Storage per account", value: "10 GB" },
      { label: "Per file", value: "100 MB" },
    ],
    addsLabel: "Everything in Free, plus",
    adds: ["Custom workspace logo", "Priority support", "Flat per account — never per seat"],
    featured: true,
  },
];

/** Specced in PRD-11 §2, not minted on Stripe: shown as the road ahead, with
 *  no way to buy them. The copy stays inside what the PRD actually says. */
export const LATER_TIERS: {
  name: string;
  price: string;
  monthlyUsd: number;
  summary: string;
  cells: string[];
}[] = [
  {
    name: "Pro",
    price: "$15/mo",
    monthlyUsd: 15,
    summary: "For growing companies",
    cells: [
      "25 people / account, including you",
      "personal + 10 team workspaces",
      "50 GB / account",
      "250 MB / file",
    ],
  },
  {
    name: "Ultra",
    price: "$29/mo",
    monthlyUsd: 29,
    summary: "For larger teams with more room to collaborate",
    cells: [
      "50 people / account, including you",
      "personal + 20 team workspaces",
      "200 GB / account",
      "1 GB / file",
    ],
  },
];

/** §4's baseline promise: nothing existing is ever taken away or gated, so
 *  every one of these ships on the free tier too. */
export const IN_EVERY_PLAN: [string, string][] = [
  ["01", "Boards with statuses, priorities, due dates and flags"],
  ["02", "Threaded comments, one level deep, beside the task they're about"],
  ["03", "Subtasks and checklists on every task"],
  ["04", "Projects and personal KPIs, weighted to 100% per task"],
  ["05", "A 365-day deadline heatmap and cumulative activity lines"],
  ["06", "Attachments on tasks and comments — capacity is the gate, never the feature"],
  ["07", "Due-soon reminders, forty-eight hours ahead"],
  ["08", "A personal workspace that becomes a team on the first accepted invite"],
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Will these people limits change my existing plan?",
    a: "Existing accounts keep their legacy per-workspace people allowances. Normal renewals keep those allowances too. New registrations use the new policy, and existing accounts switch to shared people allowances when they buy a new paid subscription or change to another paid tier. Once switched, the shared policy remains in place. Existing members are not removed if usage exceeds the new allowance.",
  },
  {
    q: "How are people counted on paid plans?",
    a: "Under the new policy, Starter includes 8 unique people, Pro 25 and Ultra 50, including the owner, shared across all personal and team workspaces that account owns. The same person in several owned workspaces counts once. Creating another workspace adds no people capacity. Free keeps its 3-member limit per workspace; Pro and Ultra are not open for signup yet.",
  },
  {
    q: "Can the same teammates join more than one workspace?",
    a: "Yes. On Starter, you and seven teammates can belong to all three team workspaces without using extra places. A different ninth person cannot join until someone leaves every workspace you own or you upgrade. Joining a workspace owned by someone else uses that owner's allowance, not yours.",
  },
  {
    q: "What happens if we already exceed the people allowance?",
    a: "Existing members keep access. New distinct people cannot join while the shared allowance is full or exceeded; existing teammates can still join another owned workspace within your team-workspace allowance. Pending invitations do not reserve places: capacity is checked again when accepted.",
  },
  {
    q: "Is storage shared across my workspaces?",
    a: "Yes. Your plan includes one account-wide storage pool shared by your personal workspace and every team workspace you own. Files uploaded by team members count toward the workspace owner’s allowance. Creating another workspace does not add storage.",
  },
  {
    q: "What happens when I hit a limit?",
    a: "Nothing is deleted. Uploads stop and no further members can join until you are back under the cap; files already stored stay downloadable. A team that outgrows its plan by downgrading keeps its people — the freeze is forward-looking, never destructive.",
  },
  {
    q: "Can I cancel whenever I want?",
    a: "Yes. Billing runs through Stripe's hosted customer portal: change the card, download invoices, cancel. No email, no support ticket, no retention call.",
  },
  {
    q: "How do I upgrade once I have an account?",
    a: "In Settings, on the Plan & billing card — the workspace leader starts checkout and the plan lands on the account the moment payment clears.",
  },
  {
    q: "Which payment methods, and why dollars?",
    a: "Cards and Link. Prices are set in USD because the ladder is international from day one: US buyers pay exact USD with no conversion anywhere, and everyone else's issuer converts as it already does for any global service.",
  },
  {
    q: "Is there an annual plan?",
    a: "Not yet. An annual price with two months free is agreed as a later addition — nothing about the monthly tiers depends on it.",
  },
];
