"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BillingInfo } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { useContainers } from "@/lib/containers";

type Options = Pick<ReturnType<typeof useAsyncError>, "run" | "clearError"> & {
  containers: ReturnType<typeof useContainers>["containers"];
};

export function useSettingsBilling({ run, clearError, containers }: Options) {
  // --- plan & billing (PRD-11 Phase 2) ---
  const { error: billingError, clearError: clearBillingError, run: runBilling } = useAsyncError();
  const billingRead = useRef<AbortController | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const billingPending = useRef(false);

  const loadBilling = useCallback(async () => {
    billingRead.current?.abort();
    const controller = new AbortController();
    billingRead.current = controller;
    clearBillingError();
    // Sync BEFORE reading: the return trip from Stripe-hosted checkout lands
    // here, and in local dev the webhook cannot reach localhost — the server
    // applies the same mapping either way. Void endpoint → ignore the value.
    const synced = await runBilling(() => api.syncBilling(), {
      fallback: "Couldn't reach billing.",
      signal: controller.signal,
    });
    if (synced === null || controller.signal.aborted) return;
    const data = await runBilling(() => api.getBilling(controller.signal), {
      fallback: "Couldn't load your plan.",
      signal: controller.signal,
    });
    if (data) setBilling(data);
  }, [runBilling, clearBillingError]);

  // Synchronize billing with the server on mount, including a return from
  // hosted checkout. An event handler cannot cover that external navigation.
  useEffect(() => {
    void loadBilling();
    return () => billingRead.current?.abort();
  }, [loadBilling]);

  // Checkout is workspace-scoped (leader-only), but the PLAN is the account's:
  // any container the caller leads works — the personal workspace always
  // qualifies. Stripe's page is outside the app, so the redirect is a hard
  // navigation, not a router push.
  const onUpgrade = async () => {
    if (billingPending.current) return;
    const team = containers.find((c) => c.role === "owner") ?? containers[0];
    if (!team) return;
    billingPending.current = true;
    setBillingBusy(true);
    clearError();
    try {
      const res = await run(() => api.startCheckout(team.id), {
        fallback: "Couldn't start checkout. Try again.",
      });
      if (!res) return;
      window.location.assign(res.url);
    } finally {
      billingPending.current = false;
      setBillingBusy(false);
    }
  };

  const onManage = async () => {
    if (billingPending.current) return;
    billingPending.current = true;
    setBillingBusy(true);
    clearError();
    try {
      const res = await run(() => api.billingPortal(), {
        fallback: "Couldn't open the billing portal.",
      });
      if (!res) return;
      window.location.assign(res.url);
    } finally {
      billingPending.current = false;
      setBillingBusy(false);
    }
  };

  const showPitch = billing !== null && billing.plan === "free" && billing.checkout_configured;

  return { billing, billingError, billingBusy, loadBilling, onUpgrade, onManage, showPitch };
}
