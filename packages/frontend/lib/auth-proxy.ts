import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/** Server-only: the selected header must be overwritten by a trusted ingress
 * and the frontend origin must be inaccessible around that ingress. */
export function setAuthProxyHeaders(
  headers: Headers,
  settings = process.env,
  now = Date.now()
): void {
  for (const name of ["x-mokara-client-ip", "x-mokara-client-time", "x-mokara-client-signature"]) {
    headers.delete(name);
  }
  const secret = settings.AUTH_PROXY_SECRET ?? "";
  const source = settings.AUTH_CLIENT_IP_HEADER?.trim().toLowerCase() ?? "";
  if (!secret && !source) return;
  if (secret.length < 32 || !["cf-connecting-ip", "x-real-ip"].includes(source)) {
    throw new Error(
      "AUTH_PROXY_SECRET and a trusted AUTH_CLIENT_IP_HEADER must be configured together"
    );
  }
  // Reject lists rather than guessing which X-Forwarded-For hop is trustworthy.
  const address = headers.get(source)?.trim().toLowerCase() ?? "";
  if (!isIP(address) || address.includes("%"))
    throw new Error("Trusted ingress did not supply a client IP");
  const timestamp = String(now);
  headers.set("x-mokara-client-ip", address);
  headers.set("x-mokara-client-time", timestamp);
  headers.set(
    "x-mokara-client-signature",
    createHmac("sha256", secret).update(`${timestamp}\n${address}`).digest("hex")
  );
}
