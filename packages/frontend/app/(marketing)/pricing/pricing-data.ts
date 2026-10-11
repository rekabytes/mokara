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

export type Tier = {
  id: string;
  name: string;
  /** The price line. "Free" is a price, not a plan name. */
  price: string;
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
    cadence: null,
    tagline: "A real workspace for up to three people, with nothing held back.",
    capacity: [
      { label: "Members per team", value: "3" },
      { label: "Workspaces", value: "personal + 1 team" },
      { label: "Storage", value: "1 GB" },
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
    cadence: "/ month",
    tagline: "Small real teams — the same product, with room to grow.",
    capacity: [
      { label: "Members per team", value: "8" },
      { label: "Workspaces", value: "personal + 3" },
      { label: "Storage", value: "10 GB" },
      { label: "Per file", value: "100 MB" },
    ],
    addsLabel: "Everything in Free, plus",
    adds: ["Custom workspace logo", "Priority support", "Flat per workspace — never per seat"],
    featured: true,
  },
];

/** Specced in PRD-11 §2, not minted on Stripe: shown as the road ahead, with
 *  no way to buy them. The copy stays inside what the PRD actually says. */
export const LATER_TIERS: { name: string; price: string; summary: string; cells: string[] }[] = [
  {
    name: "Pro",
    price: "$9/mo",
    summary: "For growing companies",
    cells: ["25 members", "personal + 10", "50 GB", "250 MB / file"],
  },
  {
    name: "Ultra",
    price: "$18/mo",
    summary: "API, MCP and audit log",
    cells: ["Unlimited members", "Unlimited workspaces", "200 GB", "1 GB / file"],
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
