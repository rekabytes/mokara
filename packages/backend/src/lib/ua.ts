// Coarse device labels for the session registry (PRD-08 §3). Deliberately
// lossy: the raw User-Agent header is never stored — only a "Browser on OS"
// pair, so the Settings device list is useful without becoming a
// fingerprinting surface. Order matters: Edge/Opera masquerade as Chrome and
// Chrome's UA contains the Safari token, so the specific tests come first.
export function describeUserAgent(ua: string | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (browser === null && os === null) return "Unknown device";
  return `${browser ?? "Unknown browser"} on ${os ?? "Unknown OS"}`;
}
