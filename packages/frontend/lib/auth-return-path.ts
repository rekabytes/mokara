/** Only application routes may resume after sign-in. Never accept an external URL. */
export function authReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\\\r\n]/.test(raw)) return "/tasks";
  const url = new URL(raw, "https://mokara.invalid");
  if (
    url.origin !== "https://mokara.invalid" ||
    (!/^\/(tasks|analytics|teams|settings|invitations)(\/|$)/.test(url.pathname) &&
      url.pathname !== "/mcp/authorize")
  )
    return "/tasks";
  return `${url.pathname}${url.search}`;
}
