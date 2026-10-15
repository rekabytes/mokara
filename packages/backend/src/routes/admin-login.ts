import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { adminConfigured, env } from "../env.ts";
import { getRedis } from "../redis.ts";
import { issueAdminToken, safeEqual } from "../lib/admin-token.ts";
import { consumeAuthLimit } from "../lib/auth-protection.ts";
import { log } from "../lib/logger.ts";
import { validate } from "../lib/validate.ts";
import { adminLoginSchema } from "../lib/validation.ts";

export const adminLoginRoutes = new Hono();

adminLoginRoutes.post(
  "/login",
  async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!adminConfigured) return c.json({ error: "not_found", message: "not found" }, 404);
    await next();
  },
  bodyLimit({
    maxSize: 4 * 1024,
    onError: (c) =>
      c.json(
        { error: "payload_too_large", message: "Sign-in request exceeds the allowed size." },
        413
      ),
  }),
  validate("json", adminLoginSchema),
  async (c) => {
    const { username, password, url_key } = c.req.valid("json");
    // Compare all three regardless of which is wrong. A caller without the
    // access key cannot exhaust the real operator's sign-in budget.
    const keyOk = safeEqual(url_key, env.ADMIN_URL_KEY);
    const userOk = safeEqual(username, env.ADMIN_USERNAME);
    const passOk = safeEqual(password, env.ADMIN_PASSWORD);
    if (!keyOk)
      return c.json({ error: "invalid_credentials", message: "invalid admin credentials" }, 401);

    try {
      // One configured operator, not one bucket per submitted username or IP.
      // The existing atomic Redis window is shared by every backend replica.
      // Successes count too; blocked attempts do not prolong the cooldown.
      const retry = await consumeAuthLimit(
        getRedis(),
        "adminLogin",
        env.ADMIN_USERNAME,
        env.ADMIN_TOKEN_SECRET
      );
      if (retry) {
        c.header("Retry-After", String(retry));
        return c.json(
          {
            error: "auth_rate_limited",
            message: "Too many sign-in attempts. Please try again later.",
          },
          429
        );
      }
    } catch {
      log.warn("admin sign-in protection unavailable — failing closed");
      return c.json(
        {
          error: "auth_protection_unavailable",
          message: "Sign-in is temporarily unavailable. Please try again shortly.",
        },
        503
      );
    }
    if (!userOk || !passOk)
      return c.json({ error: "invalid_credentials", message: "invalid admin credentials" }, 401);
    return c.json({ token: await issueAdminToken() });
  }
);
