import Stripe from "stripe";
import { prisma } from "../db.ts";
import { billingConfigured, env } from "../env.ts";
import { log } from "./logger.ts";
import { PLAN_BY_PRICE_LOOKUP_KEY, type Plan } from "./plans.ts";

// PRD-11 Phase 2 — the ONLY module that talks to Stripe. Everything the
// processor knows about "who pays for what" funnels through here into the
// three columns `users` carries (stripe_customer_id, grace_until,
// period_end) plus `users.plan` — and this module is the ONLY writer of
// `users.plan`: the webhook and the sync endpoint, both running the SAME
// mapping below.
//
// Operator grants live in their own column (`users.plan_override`, written only
// by routes/admin.ts), so the two writers never reconcile against each other;
// effectivePlan() in lib/plans.ts is the one place that decides which applies.
// A subscription resolving to a known tier clears the grant, so money still
// outranks an operator for anyone actually paying.
//
// The checkout redirect never grants anything (PRD §2.2), and
// a price whose lookup_key is not in PLAN_BY_PRICE_LOOKUP_KEY grants nothing
// either — this account also bills for another product, and its prices must
// never be able to touch a Mokara plan.
//
// Status mapping (the §6.5/§3 freeze model, decided 2026-09-07):
//   active | trialing  → plan granted, period_end tracked
//   past_due           → plan KEPT, grace_until = +7d (Stripe's Smart
//                        Retries run inside that window; the user keeps
//                        working while they do)
//   anything else      → free, billing fields cleared. Data is never
//                        deleted — over-cap state just freezes (§3).

/** Paid features survive this long into a failed-payment recovery. */
const GRACE_DAYS = 7;

let client: Stripe | null = null;

/** Lazy like storage.ts's s3(): built once, only ever called behind billingConfigured. */
export function stripeClient(): Stripe {
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/** Resolve the plan a subscription pays for. Unknown price → no plan. */
function planForSubscription(sub: Stripe.Subscription): Plan | null {
  const lookupKey = sub.items.data[0]?.price.lookup_key;
  return lookupKey ? (PLAN_BY_PRICE_LOOKUP_KEY[lookupKey] ?? null) : null;
}

/** Flexible billing keeps the period clock on the items; take the furthest. */
function periodEndForSubscription(sub: Stripe.Subscription): Date | null {
  let end: number | null = null;
  for (const item of sub.items.data) {
    if (item.current_period_end > (end ?? 0)) end = item.current_period_end;
  }
  return end === null ? null : new Date(end * 1000);
}

async function writePlan(
  userId: string,
  data: {
    plan?: Plan;
    graceUntil: Date | null;
    periodEnd: Date | null;
    /** Retire an operator grant — see the active/trialing branch below. */
    clearGrant?: boolean;
  }
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.plan ? { plan: data.plan } : {}),
      ...(data.clearGrant ? { planOverride: null } : {}),
      graceUntil: data.graceUntil,
      periodEnd: data.periodEnd,
    },
  });
}

/** The one mapping, applied to a freshly-retrieved subscription. */
export async function applySubscription(userId: string, sub: Stripe.Subscription): Promise<void> {
  switch (sub.status) {
    case "active":
    case "trialing": {
      const plan = planForSubscription(sub);
      if (!plan) {
        // A live subscription we cannot resolve is a config bug, not a
        // grant: stay honest (free) and shout in the log.
        log.warn(
          `billing: subscription ${sub.id} has no plan for its price lookup_key — user kept at free`
        );
      }
      await writePlan(userId, {
        plan: plan ?? "free",
        // Money outranks an operator: a subscription that resolves to a known
        // tier retires the grant, so the two writers cannot disagree afterwards.
        // An UNMAPPED price is a config bug (warned about above), not a purchase
        // — it must not silently revoke someone's comp.
        clearGrant: plan !== null,
        graceUntil: null,
        periodEnd: periodEndForSubscription(sub),
      });
      return;
    }
    case "past_due":
      // Keep whatever plan they had; only the grace clock moves.
      await writePlan(userId, {
        graceUntil: new Date(Date.now() + GRACE_DAYS * 86_400_000),
        periodEnd: null,
      });
      return;
    default:
      // canceled / incomplete_expired / unpaid / paused / unknown → the
      // subscription pays for nothing.
      await writePlan(userId, { plan: "free", graceUntil: null, periodEnd: null });
  }
}

/** Which Mokara user does this subscription belong to? metadata first, customer id as the fallback. */
async function userIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata["user_id"];
  if (fromMeta) {
    const byId = await prisma.user.findUnique({ where: { id: fromMeta }, select: { id: true } });
    if (byId) return byId.id;
  }
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const byCustomer = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return byCustomer?.id ?? null;
}

/**
 * Re-fetch the subscription and apply it. Webhook payloads can arrive out of
 * order, so the payload is a trigger only — the retrieved object is the truth.
 */
export async function applySubscriptionById(subscriptionId: string): Promise<void> {
  if (!billingConfigured) return;
  const sub = await stripeClient().subscriptions.retrieve(subscriptionId);
  const userId = await userIdForSubscription(sub);
  if (!userId) {
    log.warn(`billing: subscription ${subscriptionId} matches no user — ignored`);
    return;
  }
  await applySubscription(userId, sub);
}

/**
 * The belt-and-braces path for when the webhook cannot reach us (local dev
 * without the Stripe CLI, a dropped event): re-read this user's subscriptions
 * and apply the live one. A user with no customer has nothing to sync.
 */
export async function syncBillingForUser(userId: string): Promise<void> {
  if (!billingConfigured) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) return;
  const list = await stripeClient().subscriptions.list({
    customer: user.stripeCustomerId,
    status: "all",
    limit: 10,
  });
  // A customer with NO subscription at all has nothing to reconcile, and that
  // state is routine rather than rare: starting a checkout persists the customer
  // (routes/billing.ts) whether or not anyone ever pays, so an abandoned Stripe
  // page leaves exactly this shape. Writing `free` here was a harmless no-op
  // while Stripe was the plan's only writer — and destructive the moment an
  // operator grant existed, because it wiped the grant on every /settings load.
  // "Never subscribed" is not "the subscription ended", so it gets no opinion.
  //
  // A CANCELED subscription is still in this list (status: "all"), so the
  // cancel → free fallthrough below is untouched and a churned payer still drops.
  if (list.data.length === 0) return;

  const live =
    list.data.find((s) => s.status === "active" || s.status === "trialing") ??
    list.data.find((s) => s.status === "past_due");
  if (live) {
    await applySubscription(userId, live);
    return;
  }
  await writePlan(userId, { plan: "free", graceUntil: null, periodEnd: null });
}

/** Create-or-reuse the customer; the id is persisted the first time. */
export async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true, displayName: true, username: true },
  });
  if (!user) throw new Error(`ensureStripeCustomer: no user ${userId}`);
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripeClient().customers.create({
    name: user.displayName ?? user.username,
    metadata: { user_id: userId },
  });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/** Hosted Checkout in subscription mode. Returns the redirect URL; grants nothing. */
export async function createCheckoutSession(input: {
  userId: string;
  teamId: string;
  customerId: string;
  origin: string;
}): Promise<string> {
  const session = await stripeClient().checkout.sessions.create({
    mode: "subscription",
    customer: input.customerId,
    client_reference_id: input.userId,
    line_items: [{ price: env.STRIPE_PRICE_STARTER, quantity: 1 }],
    // Both hashes carry the user so either webhook path can resolve them.
    metadata: { user_id: input.userId, team_id: input.teamId },
    subscription_data: { metadata: { user_id: input.userId, team_id: input.teamId } },
    success_url: `${input.origin}/settings?checkout=success`,
    cancel_url: `${input.origin}/settings`,
  });
  if (!session.url) throw new Error("checkout session came back without a url");
  return session.url;
}

/** Stripe-hosted manage/cancel/change-card page (default portal configuration). */
export async function createPortalSession(customerId: string, origin: string): Promise<string> {
  const session = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/settings`,
  });
  return session.url;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // v22 moved the link: invoice.parent.subscription_details.subscription.
  const details = invoice.parent?.subscription_details;
  if (!details) return null;
  const sub = details.subscription;
  return typeof sub === "string" ? sub : sub.id;
}

/**
 * The webhook dispatch. Unknown types are an ack-and-ignore (Stripe delivers
 * everything the endpoint subscribes to, and more will be added); a thrown
 * error becomes a 500 so Stripe retries — the handlers are idempotent
 * (re-fetch + apply), so retry is safe.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const userId = event.data.object.client_reference_id;
      if (userId) await syncBillingForUser(userId);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await applySubscriptionById(event.data.object.id);
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = invoiceSubscriptionId(event.data.object);
      if (subscriptionId) await applySubscriptionById(subscriptionId);
      return;
    }
    default:
      return;
  }
}
