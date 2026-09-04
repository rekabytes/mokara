import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE } from "./lib/cookies";

const PROTECTED_PREFIXES = ["/tasks", "/teams", "/dashboard", "/invitations"];
const AUTH_PATHS = ["/login", "/signup"];

export function proxy(req: NextRequest) {
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

  if (isAuthPath && hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/tasks";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
