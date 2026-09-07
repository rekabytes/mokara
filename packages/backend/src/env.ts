import "dotenv/config";
import { z } from "zod";

const EnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    PORT: z.coerce.number().int().positive().default(4700),
    CORS_ALLOWED_ORIGINS: z.string().default(""),
    // Empty by default so development boots without a .env value (jwt.ts falls
    // back to a labelled dev secret). The refine below makes "unset" fatal in
    // production instead — see the comment there.
    AUTH_SECRET: z.string().default(""),
    // Session-revocation denylist (lib/sessions.ts). The default points at
    // docker-compose's exposed port so development boots with no .env value.
    // Unlike AUTH_SECRET there is no production refine here: a missing or dead
    // Redis in production is caught by connectRedis()'s fail-fast ping at
    // startup and by the middleware's fail-closed 503s at runtime.
    REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
    ENV: z.enum(["development", "production"]).default("development"),
    // PRD-11 Phase 1.1: the deploy-mode signal for subscription caps.
    // `self_hosted` is the default because that is what the published images
    // are: a self-hoster gets unlimited everything with zero configuration
    // (open-core, no phone-home, no license check). Only the hosted deployment
    // sets DEPLOY_MODE=hosted, which is what turns the plan caps on.
    // Deliberately NOT derived from a payment credential — self_hosted must
    // read unlimited with zero billing config. (The Stripe integration that
    // Phase 2 mounts when `hosted` is a §6.1 decision recorded in PRD-11.)
    DEPLOY_MODE: z.enum(["hosted", "self_hosted"]).default("self_hosted"),
    // PRD-11 Phase 1.3: object storage for task attachments. Every field is
    // optional on purpose: an instance with no bucket answers
    // `attachments_disabled` and loses nothing else, which is what lets the
    // published image boot with zero storage config. Any S3-compatible service
    // works (R2, MinIO, Backblaze, Spaces, AWS).
    S3_ENDPOINT: z.string().default(""),
    S3_BUCKET: z.string().default(""),
    S3_REGION: z.string().default("auto"),
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    // Path-style addressing (endpoint/bucket/key) is what MinIO and most
    // self-hosted gateways require; AWS and R2 accept both, but AWS has
    // deprecated it for new buckets. Default on — set it to exactly "0" for
    // real AWS. (Deliberately a string compare: z.coerce.boolean() would turn
    // "false" into true, which is the opposite of what an operator typed.)
    S3_FORCE_PATH_STYLE: z
      .string()
      .default("1")
      .transform((v) => v !== "0"),
    // PRD-11 Phase 2: Stripe billing. Every field optional on purpose — the
    // published image boots with no billing at all and answers
    // `billing_not_configured`; only a `hosted` deploy with all three set
    // mounts the routes. The secret key is a RESTRICTED key (checkout +
    // customers + subscriptions + portal, nothing else). The price id is the
    // Starter monthly USD price; tier→price mapping lives in lib/plans.ts by
    // the price's lookup_key, so rotating the id is an env change only.
    STRIPE_SECRET_KEY: z.string().default(""),
    STRIPE_WEBHOOK_SECRET: z.string().default(""),
    STRIPE_PRICE_STARTER: z.string().default(""),
  })
  // Same posture as the frontend's getBackendUrl(): a missing production secret
  // is a failed deploy, not a warning. Without this, ENV=production with no
  // AUTH_SECRET boots happily and signs every HS256 JWT with jwt.ts's dev
  // fallback — which is committed to the repo, so anyone can mint a token for
  // any user id.
  .refine((v) => v.ENV !== "production" || v.AUTH_SECRET.length >= 32, {
    message:
      "AUTH_SECRET must be set to at least 32 characters when ENV=production (generate one with: openssl rand -base64 48)",
    path: ["AUTH_SECRET"],
  });

export const env = EnvSchema.parse(process.env);
export const isProd = env.ENV === "production";
/** True only on our hosted instance; self-hosted reads everything unlimited. */
export const isHosted = env.DEPLOY_MODE === "hosted";

/**
 * Storage is "configured" only when all four coordinates are present.
 * Half-configured (a bucket with no keys) reads as unconfigured rather than
 * throwing at the first upload — see lib/storage.ts.
 */
export const storageConfigured =
  env.S3_ENDPOINT !== "" &&
  env.S3_BUCKET !== "" &&
  env.S3_ACCESS_KEY_ID !== "" &&
  env.S3_SECRET_ACCESS_KEY !== "";

/**
 * Billing is "configured" only on a hosted deploy with both Stripe secrets —
 * half-configured (a key with no webhook secret) reads as unconfigured, the
 * same posture as storageConfigured: a lying mount beats a broken one.
 * `billingRoutesMounted` gates index.ts; checkout additionally needs the
 * Starter price id (routes/billing.ts answers 409 without it).
 */
export const billingConfigured =
  isHosted && env.STRIPE_SECRET_KEY !== "" && env.STRIPE_WEBHOOK_SECRET !== "";
export const checkoutConfigured = billingConfigured && env.STRIPE_PRICE_STARTER !== "";
