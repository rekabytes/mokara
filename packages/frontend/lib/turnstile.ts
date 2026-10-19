// Route-owned browser script lifecycle; the provider is shared across form remounts.
export type Turnstile = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: "flexible";
      theme: "light";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    }
  ) => string;
  remove: (widget: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptPromise: Promise<Turnstile> | null = null;
export function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    let settled = false;
    const timer = window.setTimeout(fail, 15_000);
    function cleanup() {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    }
    function fail() {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      scriptPromise = null;
      reject(new Error("Verification could not load"));
    }
    script.onload = () => {
      if (settled) return;
      if (!window.turnstile) {
        fail();
        return;
      }
      settled = true;
      cleanup();
      resolve(window.turnstile);
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return scriptPromise;
}
