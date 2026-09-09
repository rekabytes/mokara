import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ADMIN_TOKEN_TTL_S, COOKIE_NAME, adminConfigured, env, isProd } from "./env.ts";
import { verifyAdminToken } from "./lib/admin-token.ts";
import { safeEqual } from "./lib/safe-equal.ts";
import { securityHeaders } from "./lib/security.ts";
import { backend, messageFrom, tokenFrom } from "./lib/backend.ts";
import { ADMIN_CSS, ADMIN_JS } from "./assets.ts";
import { loginPage, signedOutPage, userPage, usersPage } from "./pages.ts";

// The operator console: a session gate and a proxy, nothing else. It holds no
// database URL and no Stripe key — every read and write goes through the
// backend's /api/admin routes, which verify the same token this app verified.
//
// Port 4702 (backend 4700, frontend 4701). Dev: `pnpm dev:admin`.
//
// The login URL carries a secret (`/login?key=…`). Without a matching key the
// form is never rendered and the POST answers 404, so the credentials are not
// the only thing standing between the internet and an operator session — and a
// crawler that finds /login learns nothing. The tradeoff, stated plainly: the
// key lands in proxy access logs as a query string, and losing the cookie means
// reopening the keyed URL (bookmark it). Both are the point of the design, not
// an oversight.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The statuses the console will mirror. Hono's `c.body` wants a literal status
 * type, and narrowing through a list beats a cast; anything the backend answers
 * that is not on it (a 204, a proxy's 520) becomes an honest 502.
 */
const MIRROR_STATUSES = [200, 400, 401, 403, 404, 409, 500, 502, 503] as const;
type MirrorStatus = (typeof MIRROR_STATUSES)[number];

function mirrorStatus(status: number): MirrorStatus {
  return MIRROR_STATUSES.find((known) => known === status) ?? 502;
}

const app = new Hono();

app.use("*", securityHeaders);

// Answers without touching the backend, so a container whose upstream is down
// still reports "the console process is serving".
app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/assets/admin.css", (c) =>
  c.body(ADMIN_CSS, 200, { "content-type": "text/css; charset=utf-8" })
);
app.get("/assets/admin.js", (c) =>
  c.body(ADMIN_JS, 200, { "content-type": "text/javascript; charset=utf-8" })
);

// ---- login ----------------------------------------------------------------

app.get("/login", (c) => {
  if (!adminConfigured) return c.body("Not found", 404);
  const key = c.req.query("key") ?? "";
  // Same answer for a missing and a wrong key: this route must not become a
  // key oracle.
  if (!safeEqual(key, env.ADMIN_URL_KEY)) return c.body("Not found", 404);
  return c.html(loginPage(key));
});

app.post("/login", async (c) => {
  if (!adminConfigured) return c.body("Not found", 404);
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
    return c.redirect("/users");
  }

  if (answer.status === 401) {
    return c.html(loginPage(key, "Invalid username or password."), 401);
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
});

// POST /logout — clears the console cookie and nothing else. Deliberately NOT
// behind sessionRequired: an expired session must still be able to sign out
// (and clearing a cookie that is already gone is harmless).
//
// The token itself is stateless, so a copy of it would keep verifying until it
// expires (8h) — the console's expiry-only posture: no denylist, no device
// registry (see lib/admin-token.ts). Revoking one before expiry would mean a
// Redis denylist like the product's, which a single operator does not need.
app.post("/logout", (c) => {
  deleteCookie(c, COOKIE_NAME, { secure: isProd, sameSite: "Lax", path: "/" });
  return c.html(signedOutPage());
});

// ---- session gate ---------------------------------------------------------

function sessionToken(c: Context): string {
  return getCookie(c, COOKIE_NAME) ?? "";
}

async function sessionRequired(c: Context, next: Next): Promise<Response | void> {
  if (!adminConfigured) return c.body("Not found", 404);
  if (!(await verifyAdminToken(sessionToken(c)))) {
    // Pages bounce to the login route (which 404s without its key — the
    // operator reopens the bookmarked URL); API calls answer 401 so the page
    // script can say "session expired" instead of rendering an empty table.
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "admin_unauthorized", message: "admin login required" }, 401);
    }
    return c.redirect("/login");
  }
  await next();
}

// ---- pages ----------------------------------------------------------------

app.get("/", sessionRequired, (c) => c.redirect("/users"));

app.get("/users", sessionRequired, (c) => c.html(usersPage()));

app.get("/users/:id", sessionRequired, (c) => {
  const id = c.req.param("id");
  // The id is echoed into a data attribute: shape-check it here rather than
  // trust the escaping to carry a malformed value.
  if (id === undefined || !UUID_RE.test(id)) return c.body("Not found", 404);
  return c.html(userPage(id));
});

// ---- proxied API ----------------------------------------------------------

function mirror(c: Context, answer: { status: number; json: unknown }): Response {
  return c.body(JSON.stringify(answer.json), mirrorStatus(answer.status), {
    "content-type": "application/json; charset=utf-8",
  });
}

app.get("/api/users", sessionRequired, async (c) =>
  mirror(c, await backend("GET", "/api/admin/users", { token: sessionToken(c) }))
);

app.get("/api/users/:id", sessionRequired, async (c) => {
  const id = c.req.param("id");
  if (id === undefined || !UUID_RE.test(id)) {
    return c.json({ error: "not_found", message: "user not found" }, 404);
  }
  return mirror(
    c,
    await backend("GET", `/api/admin/users/${encodeURIComponent(id)}`, {
      token: sessionToken(c),
    })
  );
});

app.patch("/api/users/:id/plan", sessionRequired, async (c) => {
  const id = c.req.param("id");
  if (id === undefined || !UUID_RE.test(id)) {
    return c.json({ error: "not_found", message: "user not found" }, 404);
  }
  // Re-serialized rather than passed through: only the field this route owns
  // reaches the backend, whatever else was in the body.
  const raw: unknown = await c.req.json().catch(() => null);
  if (typeof raw !== "object" || raw === null || !("plan" in raw) || typeof raw.plan !== "string") {
    return c.json({ error: "invalid_input", message: "plan is required" }, 400);
  }
  return mirror(
    c,
    await backend("PATCH", `/api/admin/users/${encodeURIComponent(id)}/plan`, {
      token: sessionToken(c),
      body: { plan: raw.plan },
    })
  );
});

// ---- failures -------------------------------------------------------------

app.notFound((c) => c.body("Not found", 404));

app.onError((err, c) => {
  console.error(`[admin] unhandled ${c.req.method} ${c.req.path}`, err);
  return c.json({ error: "internal_error", message: "internal server error" }, 500);
});

// ---- listen ---------------------------------------------------------------

// Same restart-race posture as the backend: tsx watch spawns the next child
// before the old one has drained, so a brief EADDRINUSE window is expected.
const BIND_RETRIES = 5;
const BIND_RETRY_MS = 300;

let server: ServerType | null = null;

const startServer = (attempt: number): void => {
  const next = serve({ fetch: app.fetch, port: env.ADMIN_PORT, hostname: "0.0.0.0" }, () => {
    console.log(`[admin] listening on ${env.ADMIN_PORT}`);
  });
  next.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < BIND_RETRIES) {
      console.warn(
        `[admin] port ${env.ADMIN_PORT} busy — retry ${attempt}/${BIND_RETRIES} in ${BIND_RETRY_MS}ms`
      );
      setTimeout(() => startServer(attempt + 1), BIND_RETRY_MS);
      return;
    }
    console.error(`[admin] failed to bind port ${env.ADMIN_PORT}`, err);
    process.exit(1);
  });
  server = next;
};

startServer(1);

// Drop connections on SIGTERM so the container runtime's stop is immediate.
const stop = (signal: string): void => {
  console.warn(`[admin] ${signal} received, stopping...`);
  const s = server;
  s?.close();
  if (s && "closeIdleConnections" in s) s.closeIdleConnections();
  if (s && "closeAllConnections" in s) s.closeAllConnections();
  process.exit(0);
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
