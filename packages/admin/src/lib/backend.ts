import { env } from "../env.ts";

// The one path from this app to the backend. The browser never talks to the
// backend directly (that would mean CORS + a token in the page), so every admin
// API call is proxied: the console attaches the Bearer token server-side and
// mirrors the answer back.

export type BackendAnswer = { status: number; json: unknown };

const TIMEOUT_MS = 15_000;

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * BACKEND_URL is joined as a string rather than through `new URL(path, base)`:
 * a base with a path prefix (http://host/api-root) would be dropped by URL
 * resolution, and an operator's proxy setup is not this app's problem to guess.
 */
function backendUrl(path: string): string {
  return env.BACKEND_URL.replace(/\/+$/, "") + path;
}

export async function backend(
  method: "GET" | "POST" | "PATCH",
  path: string,
  opts: { token?: string; body?: unknown } = {}
): Promise<BackendAnswer> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.token !== undefined && opts.token !== "") headers.authorization = `Bearer ${opts.token}`;
  let payload: string | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(opts.body);
  }
  try {
    const res = await fetch(backendUrl(path), {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    return { status: res.status, json: text === "" ? null : safeParse(text) };
  } catch {
    // Unreachable, timed out, or answered with something that is not HTTP: the
    // console says so instead of hanging or pretending the backend answered.
    return {
      status: 502,
      json: { error: "backend_unreachable", message: "the backend did not answer" },
    };
  }
}

/** Pull `token` out of the backend's login answer without a cast. */
export function tokenFrom(answer: unknown): string | null {
  if (typeof answer !== "object" || answer === null) return null;
  if (!("token" in answer)) return null;
  return typeof answer.token === "string" && answer.token !== "" ? answer.token : null;
}

/** Pull `message` out of a backend error answer, for the pages that show it. */
export function messageFrom(answer: unknown): string | null {
  if (typeof answer !== "object" || answer === null) return null;
  if (!("message" in answer)) return null;
  return typeof answer.message === "string" ? answer.message : null;
}
