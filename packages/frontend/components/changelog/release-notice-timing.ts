export const RELEASE_NOTICE_TIMEOUT_MS = 30_000;

export function scheduleNoticeDismissal(dismiss: () => void) {
  const timer = setTimeout(dismiss, RELEASE_NOTICE_TIMEOUT_MS);
  return () => clearTimeout(timer);
}
