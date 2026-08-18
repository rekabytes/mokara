import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.ts";

export const COOKIE_NAME = "mokara_token";
export const TOKEN_LIFETIME_S = 7 * 24 * 60 * 60; // 7 days

// Dev fallback only — auth fails closed when no secret is set in prod.
const secret = new TextEncoder().encode(
  env.AUTH_SECRET || "dev-only-insecure-secret-change-me-in-prod-32b!",
);

export interface Claims {
  sub: string; // userId
  username: string;
}

export async function issueToken(userId: string, username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_LIFETIME_S}s`)
    .sign(secret);
}

export async function parseToken(token: string): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== "string" || typeof payload.username !== "string") {
      return null;
    }
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
