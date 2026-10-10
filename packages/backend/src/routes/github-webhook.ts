import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { prisma } from "../db.ts";
import { env, githubWebhookConfigured } from "../env.ts";
import { validGitHubSignature, parseGitHubWebhook } from "../lib/github-sync-rules.ts";

// Public ingress; GitHub authenticates the exact raw bytes with HMAC, not a
// session cookie. A delivery is acknowledged only after it is durably queued.
export const githubWebhookRoutes = new Hono();
githubWebhookRoutes.post(
  "/integrations/github/webhook",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) =>
      c.json({ error: "payload_too_large", message: "Webhook exceeds the 1 MiB limit" }, 413),
  }),
  async (c) => {
    if (!githubWebhookConfigured)
      return c.json(
        { error: "github_webhook_not_configured", message: "GitHub webhook is not configured" },
        503
      );
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (
      !validGitHubSignature(bytes, c.req.header("x-hub-signature-256"), env.GITHUB_WEBHOOK_SECRET)
    )
      return c.json(
        { error: "invalid_github_signature", message: "GitHub signature could not be verified" },
        401
      );
    const deliveryId = c.req.header("x-github-delivery");
    if (!z.uuid().safeParse(deliveryId).success)
      return c.json(
        { error: "invalid_github_delivery", message: "GitHub delivery ID is invalid" },
        400
      );
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return c.json({ error: "invalid_json", message: "Webhook body is not valid JSON" }, 400);
    }
    const event = parseGitHubWebhook(c.req.header("x-github-event") ?? "", body);
    if (!event) return c.json({ accepted: true, ignored: true }, 202);
    await prisma.gitHubSyncJob.upsert({
      where: { deliveryId },
      create: { kind: "webhook", deliveryId, payload: event },
      update: {},
    });
    return c.json({ accepted: true }, 202);
  }
);
