import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const issueNumber = id.max(2_147_483_647);
const timestamp = z.iso.datetime({ offset: true });
const envelope = z.object({
  installation: z.object({ id }),
  repository: z.object({ id }),
  sender: z.object({ login: z.string().min(1) }),
});
const issueEvent = envelope.extend({
  action: z.enum(["closed", "reopened"]),
  issue: z.object({
    id,
    number: issueNumber,
    updated_at: timestamp,
    pull_request: z.unknown().optional(),
  }),
});
const pullRequestEvent = envelope.extend({
  action: z.enum(["opened", "reopened", "closed", "edited"]),
  pull_request: z.object({ id, number: issueNumber, updated_at: timestamp }),
});
const branchEvent = envelope.extend({
  ref_type: z.literal("branch"),
  ref: z.string().min(1).max(1024),
});
const lifecycle = z.object({
  installation: z.object({ id }),
  action: z.enum(["deleted", "suspend", "unsuspend"]),
});
const repositoryEvent = z.object({
  installation: z.object({ id }),
  action: z.enum(["added", "removed"]),
  repositories_removed: z.array(z.object({ id })).optional(),
});
const revoked = z.object({ action: z.literal("revoked"), sender: z.object({ id }) });

export type GitHubInboundEvent =
  | {
      event: "issues";
      installationId: number;
      repositoryId: number;
      actor: string;
      action: "closed" | "reopened";
      issueId: number;
      number: number;
      updatedAt: string;
    }
  | {
      event: "pull_request";
      installationId: number;
      repositoryId: number;
      actor: string;
      action: "opened" | "reopened" | "closed" | "edited";
      pullRequestId: number;
      number: number;
      updatedAt: string;
    }
  | { event: "create"; installationId: number; repositoryId: number; actor: string; ref: string }
  | { event: "installation"; installationId: number; action: "deleted" | "suspend" | "unsuspend" }
  | { event: "installation_repositories"; installationId: number; removedIds: number[] }
  | { event: "github_app_authorization"; userId: number };

export function validGitHubSignature(
  body: Uint8Array,
  signature: string | undefined,
  secret: string
): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

/** Only documented issue-number branch names, never arbitrary numbers in a name. */
export function branchIssueNumber(ref: string): number | null {
  const match = /^(?:issue-)?([1-9]\d*)(?:[-/].+)?$/.exec(ref);
  if (!match?.[1]) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number <= 2_147_483_647 ? number : null;
}

/** Strip everything except coordinates/actions; never persist a full private-repo webhook. */
export function parseGitHubWebhook(event: string, body: unknown): GitHubInboundEvent | null {
  if (event === "issues") {
    const parsed = issueEvent.safeParse(body);
    if (!parsed.success || parsed.data.issue.pull_request !== undefined) return null;
    const p = parsed.data;
    return {
      event,
      installationId: p.installation.id,
      repositoryId: p.repository.id,
      actor: p.sender.login,
      action: p.action,
      issueId: p.issue.id,
      number: p.issue.number,
      updatedAt: p.issue.updated_at,
    };
  }
  if (event === "pull_request") {
    const parsed = pullRequestEvent.safeParse(body);
    if (!parsed.success) return null;
    const p = parsed.data;
    return {
      event,
      installationId: p.installation.id,
      repositoryId: p.repository.id,
      actor: p.sender.login,
      action: p.action,
      pullRequestId: p.pull_request.id,
      number: p.pull_request.number,
      updatedAt: p.pull_request.updated_at,
    };
  }
  if (event === "create") {
    const parsed = branchEvent.safeParse(body);
    if (!parsed.success || branchIssueNumber(parsed.data.ref) === null) return null;
    const p = parsed.data;
    return {
      event,
      installationId: p.installation.id,
      repositoryId: p.repository.id,
      actor: p.sender.login,
      ref: p.ref,
    };
  }
  if (event === "installation") {
    const parsed = lifecycle.safeParse(body);
    return parsed.success
      ? { event, installationId: parsed.data.installation.id, action: parsed.data.action }
      : null;
  }
  if (event === "installation_repositories") {
    const parsed = repositoryEvent.safeParse(body);
    return parsed.success
      ? {
          event,
          installationId: parsed.data.installation.id,
          removedIds: (parsed.data.repositories_removed ?? []).map((row) => row.id),
        }
      : null;
  }
  if (event === "github_app_authorization") {
    const parsed = revoked.safeParse(body);
    return parsed.success ? { event, userId: parsed.data.sender.id } : null;
  }
  return null;
}

// Validate the minimal persisted inbox again before a worker consumes it.
export const githubInboundSchema: z.ZodType<GitHubInboundEvent> = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("issues"),
    installationId: id,
    repositoryId: id,
    actor: z.string(),
    action: z.enum(["closed", "reopened"]),
    issueId: id,
    number: issueNumber,
    updatedAt: timestamp,
  }),
  z.object({
    event: z.literal("pull_request"),
    installationId: id,
    repositoryId: id,
    actor: z.string(),
    action: z.enum(["opened", "reopened", "closed", "edited"]),
    pullRequestId: id,
    number: issueNumber,
    updatedAt: timestamp,
  }),
  z.object({
    event: z.literal("create"),
    installationId: id,
    repositoryId: id,
    actor: z.string(),
    ref: z.string(),
  }),
  z.object({
    event: z.literal("installation"),
    installationId: id,
    action: z.enum(["deleted", "suspend", "unsuspend"]),
  }),
  z.object({
    event: z.literal("installation_repositories"),
    installationId: id,
    removedIds: z.array(id),
  }),
  z.object({ event: z.literal("github_app_authorization"), userId: id }),
]);

export function desiredGitHubState(status: string): "open" | "closed" {
  return status === "done" ? "closed" : "open";
}

export function githubTaskStatus(
  action: "closed" | "reopened" | "opened" | "branch",
  current: string
): string {
  if (action === "closed") return "done";
  if (action === "reopened") return "in_progress";
  return current === "done" ? current : "in_progress";
}
