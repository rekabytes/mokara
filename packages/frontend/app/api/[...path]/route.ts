import type { NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/backend-url.server";
import { setAuthProxyHeaders } from "./auth-proxy.server";

// Same-origin API proxy: the browser calls /api/… on this Next server and this
// handler forwards it to the backend. Adapted from jejak-athlete's
// `app/api/[...path]/route.ts`, which runs the same pattern in production.
//
// Why not let the browser call the backend directly:
//   - the auth cookie is httpOnly + SameSite=Lax + Secure in prod, so across two
//     unrelated hostnames it is a third-party cookie and the browser drops it —
//     login appears to succeed, then every request 401s and useAsyncError
//     redirect-loops to /login;
//   - the API origin would have to be a NEXT_PUBLIC_* value, i.e. baked into the
//     bundle at build time, so a published image could only ever serve one host;
//   - CORS config becomes someone's problem for no benefit.
//
// nodejs runtime, and force-dynamic: a proxy result is per-request by
// definition, and caching an authenticated response would leak it between users.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hop-by-hop and per-hop headers that must not be forwarded in either
// direction. The request body is forwarded as a stream, so its transfer framing
// belongs to fetch rather than the caller. `content-encoding` on the way back
// would be re-declared after fetch already decompressed the response.
const REQUEST_HEADERS_TO_REMOVE = [
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

const RESPONSE_HEADERS_TO_REMOVE = [
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/**
 * `Set-Cookie` is handled apart from the rest. Headers.get() collapses multiple
 * values into one comma-joined string, which the browser reads as a single
 * (broken) cookie — and login needs two: the token and, later, a cleared one on
 * logout. getSetCookie() keeps them separate and append() re-emits each.
 */
function copyResponseHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  const setCookies = upstream.headers.getSetCookie();

  for (const name of RESPONSE_HEADERS_TO_REMOVE) headers.delete(name);
  headers.delete("set-cookie");
  for (const cookie of setCookies) headers.append("set-cookie", cookie);

  return headers;
}

async function proxy(request: NextRequest): Promise<Response> {
  let backendUrl: string;
  try {
    backendUrl = getBackendUrl();
  } catch {
    // Misconfiguration, not an outage: answer 503 and keep the detail in the
    // server log rather than shipping a stack trace to the browser.
    console.error("[proxy] BACKEND_URL is not configured");
    return Response.json(
      { error: "api_misconfigured", message: "API proxy is not configured" },
      { status: 503 }
    );
  }

  // Path is forwarded unchanged: the backend mounts its routes under /api too,
  // so /api/teams/1 → ${BACKEND_URL}/api/teams/1.
  const target = new URL(`${backendUrl}${request.nextUrl.pathname}${request.nextUrl.search}`);
  const headers = new Headers(request.headers);
  for (const name of REQUEST_HEADERS_TO_REMOVE) headers.delete(name);

  if (
    (request.method === "POST" &&
      [
        "/api/auth/signup",
        "/api/auth/login",
        "/api/auth/social/complete",
        "/api/auth/social/username/claim",
      ].includes(request.nextUrl.pathname)) ||
    /^\/api\/auth\/social\/(google|github)\/(start|callback)$/.test(request.nextUrl.pathname) ||
    request.nextUrl.pathname.startsWith("/api/support-public/") ||
    request.nextUrl.pathname.startsWith("/api/mcp/oauth/")
  ) {
    try {
      setAuthProxyHeaders(headers);
    } catch {
      console.error("[proxy] Auth client-IP forwarding is not configured correctly");
      return Response.json(
        {
          error: "auth_protection_unavailable",
          message: "Authentication protection is temporarily unavailable.",
        },
        { status: 503 }
      );
    }
  }

  try {
    // Streaming lets the backend reject authentication/access/size failures
    // without first buffering the entire upload in this proxy. Node fetch
    // requires duplex for streaming request bodies; it is a transport option.
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      body: request.body,
      ...(request.body ? { duplex: "half" } : {}),
      // Manual, or a 3xx from the backend would be followed here and the browser
      // would never see the redirect it was actually told about.
      redirect: "manual",
      cache: "no-store",
      // Client disconnects mid-request must cancel the upstream call too.
      signal: request.signal,
    };
    const upstream = await fetch(target, init);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: copyResponseHeaders(upstream),
    });
  } catch {
    // The browser needs a JSON error shaped like every other failure (the API's
    // own contract), not an HTML 502 page. `useAsyncError` maps network_error
    // from the thrown shape, but this is a *response*, so send that shape here.
    // Upstream exceptions can include URLs, credentials or provider bodies.
    // Keep the operation and classification without dumping the exception.
    console.error(`[proxy] ${request.method} ${target.pathname} → backend unreachable`);
    return Response.json(
      { error: "network_error", message: "Backend unavailable" },
      { status: 502 }
    );
  }
}

// Every method forwards through the same handler. OPTIONS matters because the
// backend's CORS middleware answers preflight with a bare 204 — harmless to
// proxy, and skipping it would make the browser's preflight hit a 405 here.
export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
