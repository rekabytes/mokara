import { jwtVerify } from "jose";
import { env } from "../env.ts";

// The verifying half of the backend's lib/admin-token.ts. This app never issues
// a token — the backend does, after checking the credentials it holds — it only
// refuses to serve anything for a token it cannot verify with its own copy of
// ADMIN_TOKEN_SECRET.

function adminSecret(): Uint8Array {
  return new TextEncoder().encode(env.ADMIN_TOKEN_SECRET);
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  if (token === "") return false;
  try {
    const { payload } = await jwtVerify(token, adminSecret());
    return payload.sub === "admin" && typeof payload.jti === "string";
  } catch {
    return false;
  }
}
