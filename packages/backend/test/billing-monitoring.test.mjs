import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {
  ENV: "development",
  DEPLOY_MODE: "hosted",
  DATABASE_URL: "postgresql://test:test@invalid/billing_test",
  STRIPE_SECRET_KEY: "sk_test_isolated_fake_key",
  STRIPE_WEBHOOK_SECRET: "whsec_isolated_fake_secret",
});
let state;
const USER = "00000000-0000-4000-8000-000000000001";
const db = {
  user: {
    findUnique: async () => state.user,
    findFirst: async () => state.user,
    update: async ({ data }) => {
      Object.assign(state.user, data);
      return state.user;
    },
    updateMany: async ({ where, data }) => {
      if (
        !state.user.billingInvoiceObservedAt ||
        state.user.billingInvoiceObservedAt < where.OR[1].billingInvoiceObservedAt.lt
      )
        Object.assign(state.user, data);
      return { count: 1 };
    },
  },
  billingReconciliationEvent: {
    create: async ({ data }) => {
      state.events.push(data);
      return data;
    },
  },
  $transaction: async (work) => {
    const snapshot = structuredClone(state);
    try {
      return await work(db);
    } catch (error) {
      state = snapshot;
      throw error;
    }
  },
};
globalThis.__prisma = db;
const { stripeClient, syncBillingForUser, applySubscriptionById, handleStripeEvent } =
  await import("../src/lib/billing.ts");
const client = stripeClient();
function subscription(status = "active", mapped = true) {
  return {
    id: "sub_isolated",
    created: 10,
    status,
    customer: "cus_isolated",
    metadata: { user_id: USER },
    cancel_at_period_end: false,
    cancel_at: null,
    items: {
      data: [
        {
          current_period_end: 1900000000,
          price: { lookup_key: mapped ? "starter_monthly" : "other_product" },
        },
      ],
    },
  };
}
beforeEach(() => {
  state = {
    user: {
      id: USER,
      plan: "free",
      planOverride: "pro",
      stripeCustomerId: "cus_isolated",
      billingVerifiedAt: null,
      billingInvoiceObservedAt: null,
    },
    events: [],
  };
  client.subscriptions.list = async () => ({ data: [subscription()], has_more: false });
  client.subscriptions.retrieve = async () => subscription();
});
test("verified subscription is separate from grants and records successful reconciliation", async () => {
  await syncBillingForUser(USER);
  assert.equal(state.user.plan, "starter");
  assert.equal(state.user.planOverride, null);
  assert.equal(state.user.billingStatus, "active");
  assert.ok(state.user.billingVerifiedAt instanceof Date);
  assert.equal(state.events[0].source, "user_sync");
  assert.equal(state.events[0].outcome, "verified");
});
test("subscription verification includes later pages", async () => {
  let calls = 0;
  client.subscriptions.list = async ({ starting_after }) => {
    calls++;
    return starting_after
      ? { data: [subscription()], has_more: false }
      : { data: [{ ...subscription("canceled"), id: "sub_old" }], has_more: true };
  };
  await syncBillingForUser(USER);
  assert.equal(calls, 2);
  assert.equal(state.user.billingStatus, "active");
  assert.equal(state.user.plan, "starter");
});

test("empty subscriptions verify none without revoking a comp", async () => {
  client.subscriptions.list = async () => ({ data: [], has_more: false });
  await syncBillingForUser(USER);
  assert.equal(state.user.billingStatus, "none");
  assert.equal(state.user.planOverride, "pro");
  assert.equal(state.user.plan, "free");
});
test("failure keeps the last verified observation and persists only classified errors", async () => {
  const verified = new Date(10000);
  state.user.billingVerifiedAt = verified;
  client.subscriptions.list = async () => {
    throw new Error("private provider response sk_secret_do_not_store");
  };
  await assert.rejects(syncBillingForUser(USER));
  assert.equal(state.user.billingVerifiedAt, verified);
  assert.equal(state.user.planOverride, "pro");
  assert.equal(state.user.billingErrorCode, "billing_reconciliation_failed");
  assert.equal(state.events[0].outcome, "failed");
  assert.equal(JSON.stringify(state.events).includes("sk_secret"), false);
});
test("retrieval failure before user resolution is visible as an unassigned webhook failure", async () => {
  client.subscriptions.retrieve = async () => {
    throw new Error("private failure");
  };
  await assert.rejects(applySubscriptionById("sub_isolated"));
  assert.equal(state.events[0].userId, null);
  assert.equal(state.events[0].source, "webhook");
});
test("scheduled and completed cancellation report provider state, not a guessed free plan", async () => {
  client.subscriptions.retrieve = async () => ({
    ...subscription(),
    cancel_at_period_end: true,
    cancel_at: 1900000000,
  });
  await applySubscriptionById("sub_isolated");
  assert.equal(state.user.billingCancelAtPeriodEnd, true);
  assert.equal(state.user.billingCancelAt.getTime(), 1900000000000);
  client.subscriptions.list = async () => ({ data: [subscription("canceled")], has_more: false });
  await syncBillingForUser(USER);
  assert.equal(state.user.billingStatus, "canceled");
  assert.equal(state.user.plan, "free");
});
test("unmapped active price leaves comp intact and exposes a configuration warning", async () => {
  client.subscriptions.list = async () => ({
    data: [subscription("active", false)],
    has_more: false,
  });
  await syncBillingForUser(USER);
  assert.equal(state.user.planOverride, "pro");
  assert.equal(state.user.billingStatus, "active");
  assert.equal(state.user.billingErrorCode, "billing_unmapped_price");
  assert.equal(state.events[0].outcome, "failed");
});
test("invoice observations reject delayed notifications and show payment recovery", async () => {
  const invoice = { parent: { subscription_details: { subscription: "sub_isolated" } } };
  await handleStripeEvent({
    type: "invoice.payment_failed",
    created: 200,
    data: { object: invoice },
  });
  assert.equal(state.user.billingInvoiceStatus, "payment_failed");
  await handleStripeEvent({ type: "invoice.paid", created: 100, data: { object: invoice } });
  assert.equal(state.user.billingInvoiceStatus, "payment_failed");
  await handleStripeEvent({ type: "invoice.paid", created: 300, data: { object: invoice } });
  assert.equal(state.user.billingInvoiceStatus, "paid");
});
test("checkout reconciliation attributes webhook source; no customer makes no invented verification", async () => {
  await handleStripeEvent({
    type: "checkout.session.completed",
    data: { object: { client_reference_id: USER } },
  });
  assert.equal(state.events[0].source, "webhook");
  state.user.stripeCustomerId = null;
  state.events = [];
  await syncBillingForUser(USER);
  assert.equal(state.events.length, 0);
});
