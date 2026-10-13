import { z } from "zod";
import { getBackendUrl } from "@/lib/backend-url.server";
import { parseResponse } from "@/lib/api-validation";

const resourceMetadataSchema = z.object({
  resource: z.url().refine((raw) => {
    const url = new URL(raw);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/api/mcp"
    );
  }),
});

/** Backend discovery owns the canonical resource, derived from AUTH_PUBLIC_URL.
 * Read it at request time so one frontend image works in every deployment. */
export async function getMcpConnectionUrl(): Promise<string | null> {
  // Do not inherit a local fallback when runtime configuration is absent.
  if (!process.env.BACKEND_URL?.trim()) return null;
  try {
    const response = await fetch(
      `${getBackendUrl()}/.well-known/oauth-protected-resource/api/mcp`,
      {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) return null;
    return parseResponse(resourceMetadataSchema, await response.json()).resource;
  } catch {
    // Public setup details may be temporarily unavailable. Never substitute a
    // hostname or expose upstream exceptions, URLs, credentials or bodies.
    return null;
  }
}
