import { z } from "zod";
import { getBackendUrl } from "./backend-url.server";
import { supportConfigSchema } from "./support-types";
export async function getSupportConfiguration(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  try {
    const response = await fetch(`${getBackendUrl()}/api/support-public/sites/${id}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const parsed = supportConfigSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
