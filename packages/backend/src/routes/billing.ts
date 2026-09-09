import { Hono } from "hono";
import type Stripe from "stripe";
import { prisma } from "../db.ts";
import { billingConfigured, checkoutConfigured, env } from "../env.ts";
import {
  createCheckoutSession,
  createPortalSession,
  ensureStripeCustomer,
  handleStripeEvent,
  stripeClient,
  syncBillingForUser,
} from "../lib/billing.ts";
import { limitsOfUser } from "../lib/entitlements.ts";
import { effectivePlan, limitsFor, PLAN_IDS, publicCap } from "../lib/plans.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import type { Vars } from "../middleware/auth.ts";

// PRD-11 Phase 2 routes. Two apps because the webhook is the one billing
// surface that is NOT session-authed: `billingWebhook` mounts on the public
// api before the authed sub-app (its signature check is the auth), while
// `billingRoutes` mounts with everything else that needs the cookie.
//
// Every route answers honestly when billing is off: self-hosted instances
// (the published default) never mounted these at all pre-Phase-2 — now they
// mount only on `hosted`, and `GET /me/billing` answers everywhere so the
// settings tile can render the plan truthfully either way.

export const billingRoutes = new Hono<{ Variables: Vars }>();
export const billingWebhook = new Hono();

/** The browser's Origin survives our same-origin proxy; the request URL only
 *  knows the backend's own address — which would strand the checkout return. */
function publicOrigin(c: {
  req: { header: (n: string) => string | undefined; url: string };
}): string {
  return c.req.header("origin") ?? new URL(c.req.url).origin;
}

// GET /me/billing — the settings tile's payload. Plan + billing state + the
// caller's caps, in one read. `billing_configured`/`checkout_configured` tell
// the UI whether Upgrade/Manage buttons can possibly work.
billingRoutes.get("/me/billing", async (c) => {
  const userId = c.get("userId");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      planOverride: true,
      periodEnd: true,
      graceUntil: true,
      stripeCustomerId: true,
    },
  });
  if (!user) {
    return c.json({ error: "not_found", message: "user not found" }, 404);
  }
  const limits = await limitsOfUser(userId);
  return c.json({
    // The tier the account actually gets: an operator grant wins over Stripe's
    // column (effectivePlan). The frontend renders this word and the caps below,
    // so both come from the same resolution and cannot drift apart.
    plan: effectivePlan(user),
    billing_configured: billingConfigured,
    checkout_configured: checkoutConfigured,
    has_subscription: user.stripeCustomerId !== null,
    period_end: user.periodEnd ? user.periodEnd.toISOString() : null,
    grace_until: user.graceUntil ? user.graceUntil.toISOString() : null,
    caps: {
      members: publicCap(limits.members),
      teams: publicCap(limits.teams),
      storage_bytes: publicCap(limits.storageBytes),
      file_bytes: publicCap(limits.maxFileBytes),
    },
    // The whole tier ladder, from the one table. The settings tile renders
    // "what the next tier unlocks" from this — numbers are never hardcoded
    // in the UI, so display and enforcement can't drift apart. Raw tiers,
    // not DEPLOY_MODE-filtered: on self-hosted the pitch is hidden anyway.
    plans: Object.fromEntries(
      PLAN_IDS.map((id) => {
        const tier = limitsFor(id);
        return [
          id,
          {
            members: publicCap(tier.members),
            teams: publicCap(tier.teams),
            storage_bytes: publicCap(tier.storageBytes),
            file_bytes: publicCap(tier.maxFileBytes),
          },
        ];
      })
    ),
  });
});

// POST /teams/:id/billing/checkout — leader-only, per PRD §2.2. Returns the
// Stripe-hosted redirect; grants NOTHING (the webhook / sync do that).
billingRoutes.post("/teams/:id/billing/checkout", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;
  if (!checkoutConfigured) {
    return c.json(
      { error: "billing_not_configured", message: "billing is not enabled on this instance" },
      409
    );
  }
  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }
  if (role !== "owner") {
    return c.json({ error: "owner_only", message: "only the workspace leader can subscribe" }, 403);
  }
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (!me) {
    return c.json({ error: "not_found", message: "user not found" }, 404);
  }
  // One subscription per payer: an upgrade or cancellation goes through the
  // portal, not a second checkout.
  //
  // Reads `users.plan` — Stripe's column — and NOT effectivePlan, deliberately:
  // an operator grant must never lock someone out of paying. A comped account
  // has plan 'free' plus an override, so it can still start a checkout; if it
  // completes, the subscription retires the grant (lib/billing.ts).
  if (me.plan !== "free") {
    return c.json(
      {
        error: "already_subscribed",
        message: "you already have a paid plan — change or cancel it from the billing portal",
      },
      409
    );
  }
  const customerId = await ensureStripeCustomer(userId);
  const url = await createCheckoutSession({
    userId,
    teamId,
    customerId,
    origin: publicOrigin(c),
  });
  return c.json({ url });
});

// POST /me/billing/portal — Stripe-hosted manage/cancel/change-card page.
billingRoutes.post("/me/billing/portal", async (c) => {
  const userId = c.get("userId");
  if (!billingConfigured) {
    return c.json(
      { error: "billing_not_configured", message: "billing is not enabled on this instance" },
      409
    );
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) {
    return c.json(
      { error: "no_subscription", message: "no billing account yet — upgrade first" },
      409
    );
  }
  const url = await createPortalSession(user.stripeCustomerId, publicOrigin(c));
  return c.json({ url });
});

// POST /me/billing/sync — the webhook's understudy. The settings tile calls
// it on mount: after a checkout return (and in local dev, where Stripe cannot
// reach localhost) it re-reads this user's subscriptions and applies the same
// mapping the webhook applies. No-op without billing config or a customer.
billingRoutes.post("/me/billing/sync", async (c) => {
  const userId = c.get("userId");
  if (billingConfigured) await syncBillingForUser(userId);
  return c.body(null, 204);
});

// POST /billing/webhook — public, mounted BEFORE the authed sub-app. The
// signature IS the authentication: raw body + Stripe-Signature + the
// endpoint secret, verified through the SDK. Handler errors bubble to a 500
// on purpose — Stripe retries, and every handler re-fetches before applying,
// so delivery is idempotent.
billingWebhook.post("/webhook", async (c) => {
  if (!billingConfigured) {
    return c.json(
      { error: "billing_not_configured", message: "billing is not enabled on this instance" },
      409
    );
  }
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "invalid_input", message: "missing stripe-signature header" }, 400);
  }
  const raw = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await stripeClient().webhooks.constructEventAsync(
      raw,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return c.json(
      { error: "invalid_signature", message: "webhook signature verification failed" },
      400
    );
  }
  await handleStripeEvent(event);
  return c.json({ received: true });
});
