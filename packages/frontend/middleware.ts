import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/", "/teams", "/invitations"];
const AUTH_PATHS = ["/login", "/signup"];

export function middleware(req: NextRequest) {
  const hasCookie = Boolean(req.cookies.get("mokara_token")?.value);
  const path = req.nextUrl.pathname;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  const isAuthPath = AUTH_PATHS.includes(path);

  if (isProtected && !hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", path);
    return NextResponse.redirect(url);
  }

  if (isAuthPath && hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};