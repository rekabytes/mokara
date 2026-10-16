/** Configuration values only: never infer trust from Host/forwarded headers. */
function configuredOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    return value === url.origin || value === `${url.origin}/` ? url.origin : null;
  } catch {
    return null;
  }
}

export function validBrowserOriginList(raw: string): boolean {
  return raw.split(",").every((value) => !value.trim() || configuredOrigin(value.trim()) !== null);
}

export function allowedBrowserOrigin(
  origin: string | undefined,
  settings: { AUTH_PUBLIC_URL: string; CORS_ALLOWED_ORIGINS: string }
): boolean {
  if (!origin || origin === "null" || configuredOrigin(origin) !== origin) return false;
  const publicOrigin = configuredOrigin(settings.AUTH_PUBLIC_URL?.trim() ?? "");
  return (
    origin === publicOrigin ||
    settings.CORS_ALLOWED_ORIGINS.split(",").some(
      (value) => configuredOrigin(value.trim()) === origin
    )
  );
}

/** Machine-only surfaces authenticate with signatures or separate Bearer tokens.
 * Exact boundaries matter: a similarly prefixed browser route is not exempt. */
export function originlessMachinePath(path: string): boolean {
  return (
    path === "/api/billing/webhook" ||
    path === "/api/integrations/github/webhook" ||
    path === "/api/admin" ||
    path.startsWith("/api/admin/")
  );
}
