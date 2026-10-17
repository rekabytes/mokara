import { NextResponse, type NextRequest } from "next/server";
import { getSupportConfiguration } from "./lib/support.server";
import { AUTH_COOKIE } from "./lib/cookies";

const PROTECTED_PREFIXES = [
  "/support",
  "/files",
  "/tasks",
  "/teams",
  "/dashboard",
  "/invitations",
  "/settings",
];
const AUTH_PATHS = ["/login", "/signup"];

export async function proxy(req: NextRequest) {
  const hasCookie = Boolean(req.cookies.get(AUTH_COOKIE)?.value);
  const path = req.nextUrl.pathname;

  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
  const isAuthPath = AUTH_PATHS.includes(path);

  if (isProtected && !hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", path);
    return NextResponse.redirect(url);
  }

  if (isAuthPath && hasCookie && !req.nextUrl.searchParams.has("from")) {
    const url = req.nextUrl.clone();
    url.pathname = "/tasks";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  if (/^\/api\/teams\/[^/]+\/files\/[^/]+\/preview$/.test(path)) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  if (path.startsWith("/ticket-form/") && /^\/ticket-form\/[0-9a-f-]{36}$/.test(path)) {
    const id = path.split("/")[2];
    const configuration = id ? await getSupportConfiguration(id) : null;
    response.headers.delete("X-Frame-Options");
    // Only the public, session-free form can be framed. Private ticket pages
    // retain DENY and the default frame-ancestors 'none' policy.
    const ancestors = configuration?.site.origins.join(" ") || "'none'";
    const scripts =
      process.env.NODE_ENV === "production"
        ? "'self' 'unsafe-inline'"
        : "'self' 'unsafe-inline' 'unsafe-eval'";
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src ${scripts} https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors ${ancestors}`
    );
  }
  if (path.startsWith("/ticket-form/") || path.startsWith("/support-ticket/")) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
