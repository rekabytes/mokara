import type { Prisma } from "@mokara/db/prisma/generated/client";
import { toTask, toTaskKpi } from "./types.ts";

// HTTP mutations and GitHub webhook SSE updates must carry the same full task.
export const TASK_INCLUDE = {
  kpiBindings: { include: { kpi: { select: { name: true } } } },
  creator: { select: { id: true, username: true, displayName: true } },
  assignee: { select: { id: true, username: true, displayName: true } },
  subtaskItems: true,
  githubIssueLink: true,
} as const;

export function taskResponse(task: Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>) {
  return toTask(task, task.kpiBindings.map(toTaskKpi));
}
