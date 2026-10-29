import { expireAgentLeases } from "./agent-sync.ts";
import { log } from "./logger.ts";
export function startAgentLeaseWorker() {
  let pending: Promise<void> | null = null;
  const tick = () => {
    if (pending) return;
    pending = expireAgentLeases()
      .then(
        () => {},
        () => {
          log.error("Agent lease expiry check failed");
        }
      )
      .finally(() => {
        pending = null;
      });
  };
  const timer = setInterval(tick, 30_000);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await pending;
  };
}
