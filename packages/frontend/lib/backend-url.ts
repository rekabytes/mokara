const LOCAL_BACKEND_URL = "http://localhost:4700";

/**
 * Origin of the backend, as the Next *server* reaches it.
 *
 * This is deliberately not `NEXT_PUBLIC_*`: a public var is inlined into the
 * browser bundle at build time, which pins a published Docker image to one
 * host. The browser only ever calls same-origin `/api/...` (see
 * `app/api/[...path]/route.ts`), so the backend's address is a runtime detail
 * of the Next server and nothing else — one image then serves any host, which
 * is the point of pulling an image instead of building one.
 *
 * Value has no trailing slash and no `/api` suffix: `BACKEND_URL=http://backend:4700`.
 */
export function getBackendUrl(): string {
  const configuredUrl = process.env.BACKEND_URL?.trim();

  if (!configuredUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BACKEND_URL is required in production");
    }
    return LOCAL_BACKEND_URL;
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("BACKEND_URL must be an absolute http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BACKEND_URL must use http or https");
  }
  if (url.search || url.hash) {
    throw new Error("BACKEND_URL must not contain a query string or fragment");
  }

  return url.toString().replace(/\/+$/, "");
}
