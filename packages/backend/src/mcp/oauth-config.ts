import { env } from "../env.ts";

export const MCP_SCOPE = "mokara:read";
export const ACCESS_SECONDS = 900;
export const GRANT_SECONDS = 30 * 86_400;

// Never derive issuer/resource/redirect URLs from Host or forwarded headers.
export function mcpOAuthConfig() {
  try {
    const url = new URL(env.AUTH_PUBLIC_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.protocol !== "https:" &&
      !(env.ENV !== "production" && local && url.protocol === "http:")
    )
      return null;
    return {
      origin: url.origin,
      resource: `${url.origin}/api/mcp`,
      metadata: `${url.origin}/.well-known/oauth-protected-resource/api/mcp`,
    };
  } catch {
    return null;
  }
}

export function isSafeOAuthRedirect(raw: string) {
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.hash || raw.includes("#") || /[\\\r\n]/.test(raw))
      return false;
    // Native loopback HTTP callbacks remain available in production.
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export function requireOAuthConfig() {
  const config = mcpOAuthConfig();
  if (!config) throw new Error("MCP OAuth is not configured");
  return config;
}
