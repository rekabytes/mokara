import "dotenv/config";
import { z } from "zod";

// The operator console's ENV contract. Two of these values MUST equal their
// backend counterparts — that is the whole integration:
//
//   ADMIN_TOKEN_SECRET = the backend's ADMIN_TOKEN_SECRET. The backend signs
//     the console token with it; this app verifies the same token with its own
//     copy before it will serve a page or proxy a call. Mismatched secrets show
//     up as a 502 on login with a message saying exactly that.
//   ADMIN_URL_KEY = the backend's ADMIN_URL_KEY. This app refuses to render the
//     login form without it in the URL; the backend refuses the login without
//     it in the body. Two checks, one value.
//
// Nothing else is shared: the console holds no database URL and no Stripe key,
// so a compromised admin box cannot read the product database directly — it can
// only ask the backend for what the admin API serves.

const EnvSchema = z
  .object({
    /** Internal address of the mokara backend (never exposed to the browser). */
    BACKEND_URL: z.string().min(1, "BACKEND_URL is required").default("http://127.0.0.1:4700"),
    ADMIN_PORT: z.coerce.number().int().positive().default(4702),
    ENV: z.enum(["development", "production"]).default("development"),
    ADMIN_TOKEN_SECRET: z.string().default(""),
    ADMIN_URL_KEY: z.string().default(""),
  })
  // Same posture as the backend's AUTH_SECRET refine: a production console with
  // a guessable signing key or a short URL key is a failed deploy, not a warning.
  //
  // The asymmetry with the backend's ADMIN_* block is deliberate. Over there a
  // weak or partial value only disables an OPTIONAL console while the product API
  // keeps serving, so it warns and moves on. Here the console IS the service:
  // booting it with a guessable signing key would put a live admin surface on the
  // internet, so failing fast is the only safe answer.
  .refine((v) => v.ENV !== "production" || v.ADMIN_TOKEN_SECRET.length >= 32, {
    message:
      "ADMIN_TOKEN_SECRET must be at least 32 characters when ENV=production (generate one with: openssl rand -base64 48)",
    path: ["ADMIN_TOKEN_SECRET"],
  })
  .refine((v) => v.ENV !== "production" || v.ADMIN_URL_KEY.length >= 16, {
    message:
      "ADMIN_URL_KEY must be at least 16 characters when ENV=production (generate one with: openssl rand -hex 16)",
    path: ["ADMIN_URL_KEY"],
  });

export const env = EnvSchema.parse(process.env);

export const isProd = env.ENV === "production";

/**
 * Both shared secrets present, or the console does not exist: every route
 * answers 404 and the login form is never rendered. Half-configured reads as
 * off, matching storageConfigured/billingConfigured on the backend.
 */
export const adminConfigured = env.ADMIN_TOKEN_SECRET !== "" && env.ADMIN_URL_KEY !== "";

/**
 * Must equal ADMIN_TOKEN_TTL_S in the backend's lib/admin-token.ts. The cookie
 * and the token expire together; a cookie outliving its token would only produce
 * a 401 from the backend on the first proxied call.
 */
export const ADMIN_TOKEN_TTL_S = 8 * 60 * 60; // 8 hours

/**
 * `__Host-` in production for the same reason the product cookie uses it: the
 * browser then rejects the cookie unless it is Secure, Path=/ and Domain-less,
 * which makes those guarantees browser-enforced instead of conventional. Dev
 * keeps the plain name because Secure cannot be stored over plain http.
 */
export const COOKIE_NAME = isProd ? "__Host-mokara_admin_token" : "mokara_admin_token";
