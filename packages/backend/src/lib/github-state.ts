import { randomBytes } from "node:crypto";
import { getRedis } from "../redis.ts";

const PREFIX = "github:oauth-state:";
const TTL_SECONDS = 10 * 60;

type GitHubState = {
  userId: string;
  purpose: "oauth" | "install";
  pendingInstallationId?: string;
};

export async function createGitHubState(value: GitHubState): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  await getRedis().set(`${PREFIX}${state}`, JSON.stringify(value), "EX", TTL_SECONDS, "NX");
  return state;
}

export async function consumeGitHubState(state: string): Promise<GitHubState | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(state)) return null;
  const raw = await getRedis().getdel(`${PREFIX}${state}`);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const row = parsed as Record<string, unknown>;
    if (typeof row.userId !== "string") return null;
    if (row.purpose !== "oauth" && row.purpose !== "install") return null;
    if (row.pendingInstallationId !== undefined && typeof row.pendingInstallationId !== "string") {
      return null;
    }
    return {
      userId: row.userId,
      purpose: row.purpose,
      ...(typeof row.pendingInstallationId === "string"
        ? { pendingInstallationId: row.pendingInstallationId }
        : {}),
    };
  } catch {
    return null;
  }
}
