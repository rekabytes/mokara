import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.ts";

export const COOKIE_NAME = "mokara_token";
export const TOKEN_LIFETIME_S = 7 * 24 * 60 * 60; // 7 days

// Dev fallback only — auth fails closed when no secret is set in prod.
const secret = new TextEncoder().encode(
  env.AUTH_SECRET || "dev-only-insecure-secret-change-me-in-prod-32b!"
);

export interface Claims {
  sub: string; // userId
  username: string;
  jti: string; // session id — logout revokes this exact token (lib/sessions.ts)
}

export async function issueToken(userId: string, username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_LIFETIME_S}s`)
    .sign(secret);
}

export type ParsedToken = Claims & { exp?: number };

export async function parseToken(token: string): Promise<ParsedToken | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.jti !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      username: payload.username,
      jti: payload.jti,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}
