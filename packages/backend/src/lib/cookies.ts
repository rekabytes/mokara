import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import { COOKIE_NAME, TOKEN_LIFETIME_S } from "./jwt.ts";
import { isProd } from "../env.ts";

export function setAuthCookie(c: Context, token: string) {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax",
    path: "/",
    maxAge: TOKEN_LIFETIME_S,
  });
}

export function clearAuthCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, {
    secure: isProd,
    sameSite: "Lax",
    path: "/",
  });
}

export function readAuthCookie(c: Context): string | null {
  return getCookie(c, COOKIE_NAME) ?? null;
}
