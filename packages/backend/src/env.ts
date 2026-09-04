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
