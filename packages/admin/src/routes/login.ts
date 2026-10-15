import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { setCookie } from "hono/cookie";
import { ADMIN_TOKEN_TTL_S, COOKIE_NAME, adminConfigured, env, isProd } from "../env.ts";
import { verifyAdminToken } from "../lib/admin-token.ts";
import { safeEqual } from "../lib/safe-equal.ts";
import { backend, messageFrom, tokenFrom } from "../lib/backend.ts";
import { loginPage } from "../pages.ts";

export function mountAdminLoginRoutes(app: Hono): void {
  // ---- login ----------------------------------------------------------------

  app.get("/login", (c) => {
    if (!adminConfigured) return c.body("Not found", 404);
    const key = c.req.query("key") ?? "";
    // Same answer for a missing and a wrong key: this route must not become a
    // key oracle.
    if (!safeEqual(key, env.ADMIN_URL_KEY)) return c.body("Not found", 404);
    return c.html(loginPage(key));
  });

  app.post(
    "/login",
    async (c, next) => {
      if (!adminConfigured) return c.body("Not found", 404);
      await next();
    },
    bodyLimit({
      maxSize: 4 * 1024,
      onError: (c) => c.body("Sign-in request exceeds the allowed size.", 413),
    }),
    async (c) => {
      const fields = await c.req.parseBody();
      const username = typeof fields.username === "string" ? fields.username : "";
      const password = typeof fields.password === "string" ? fields.password : "";
      const key = typeof fields.url_key === "string" ? fields.url_key : "";
      // Checked here AND by the backend. The form only renders for a correct key,
      // but the POST is reachable without ever having seen it.
      if (!safeEqual(key, env.ADMIN_URL_KEY)) return c.body("Not found", 404);

      const answer = await backend("POST", "/api/admin/login", {
        body: { username, password, url_key: key },
      });

      if (answer.status === 200) {
        const token = tokenFrom(answer.json);
        if (token === null) {
          return c.html(loginPage(key, "The backend returned no token."), 502);
        }
        // The second half of "verify the token from the admin .env against the
        // backend .env": never serve a page for a token this app cannot verify with
        // its own copy of ADMIN_TOKEN_SECRET.
        if (!(await verifyAdminToken(token))) {
          return c.html(
            loginPage(
              key,
              "The backend's token failed verification here — ADMIN_TOKEN_SECRET differs between the two .env files."
            ),
            502
          );
        }
        setCookie(c, COOKIE_NAME, token, {
          httpOnly: true,
          secure: isProd,
          sameSite: "Lax",
          path: "/",
          maxAge: ADMIN_TOKEN_TTL_S,
        });
        return c.redirect("/overview");
      }

      if (answer.status === 401) {
        return c.html(loginPage(key, "Invalid username or password."), 401);
      }
      if (answer.status === 429) {
        if (answer.retryAfter !== undefined) c.header("Retry-After", String(answer.retryAfter));
        const minutes = answer.retryAfter === undefined ? null : Math.ceil(answer.retryAfter / 60);
        const message =
          minutes === null
            ? "Too many sign-in attempts. Please try again later."
            : `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
        return c.html(loginPage(key, message), 429);
      }
      if (answer.status === 503) {
        return c.html(
          loginPage(key, "Sign-in is temporarily unavailable. Please try again shortly."),
          503
        );
      }
      if (answer.status === 404) {
        return c.html(
          loginPage(
            key,
            "The backend has no admin console configured — set ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_TOKEN_SECRET and ADMIN_URL_KEY in its .env."
          ),
          502
        );
      }
      const detail = messageFrom(answer.json);
      return c.html(loginPage(key, detail ?? `The backend answered ${answer.status}.`), 502);
    }
  );
}
