import { numericGoalProgress } from "./kpi-goal-progress.ts";
import { createHash } from "node:crypto";
import { Prisma } from "@mokara/db/prisma/generated/client";
import type { z } from "zod";
import { z as schema } from "zod";
import { prisma } from "../db.ts";
import {
  createKpiGoalSchema,
  checkInKpiGoalSchema,
  updateKpiGoalSchema,
  createKpiPeriodSchema,
} from "./validation.ts";

const include = {
  contributors: { select: { userId: true } },
  owner: { select: { username: true, displayName: true } },
  nextPeriod: { select: { id: true } },
} satisfies Prisma.KpiGoalInclude;
type Goal = Prisma.KpiGoalGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;
type Create = z.infer<typeof createKpiGoalSchema>;
type CheckIn = z.infer<typeof checkInKpiGoalSchema>;
type Update = z.infer<typeof updateKpiGoalSchema>;
export class KpiGoalError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 403 | 404 | 409 = 400
  ) {
    super(message);
  }
}
const fail = (code: string, message: string, status: 400 | 403 | 404 | 409 = 400): never => {
  throw new KpiGoalError(code, message, status);
};
const date = (value: Date) => value.toISOString().slice(0, 10);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canRead = (goal: Goal, userId: string) => goal.scope === "team" || goal.ownerId === userId;
const canManage = (goal: Goal, userId: string, role: string) =>
  goal.ownerId === userId || (goal.scope === "team" && role === "owner");
const canCheckIn = (goal: Goal, userId: string, role: string) =>
  !goal.archived &&
  (canManage(goal, userId, role) || goal.contributors.some((c) => c.userId === userId));

function toGoal(goal: Goal, userId: string, role: string) {
  return {
    id: goal.id,
    team_id: goal.teamId,
    name: goal.name,
    scope: goal.scope,
    measurement: goal.measurement,
    owner_id: goal.ownerId,
    owner_name: goal.owner?.displayName || goal.owner?.username || goal.ownerName,
    contributor_ids: goal.contributors.map((c) => c.userId),
    unit: goal.unit,
    baseline: goal.baseline.toString(),
    target: goal.target.toString(),
    current_value: goal.currentValue?.toString() ?? null,
    start_date: date(goal.startDate),
    end_date: date(goal.endDate),
    last_observed_on: goal.lastObservedOn ? date(goal.lastObservedOn) : null,
    last_check_in_at: goal.lastCheckInAt?.toISOString() ?? null,
    archived: goal.archived,
    revision: goal.revision,
    progress: numericGoalProgress(
      goal.baseline.toString(),
      goal.target.toString(),
      goal.currentValue?.toString() ?? null
    ),
    can_manage: canManage(goal, userId, role),
    can_check_in: canCheckIn(goal, userId, role) && date(goal.startDate) <= date(new Date()),
    created_at: goal.createdAt.toISOString(),
    updated_at: goal.updatedAt.toISOString(),
    previous_goal_id: goal.previousGoalId,
    next_goal_id: goal.nextPeriod?.id ?? null,
    can_create_period:
      !goal.nextPeriod && (goal.scope === "personal" ? goal.ownerId === userId : role === "owner"),
  };
}
function toEntry(entry: Prisma.KpiGoalEntryGetPayload<Record<string, never>>) {
  return {
    id: entry.id,
    sequence: entry.sequence.toString(),
    kind: entry.kind,
    author_name: entry.authorName,
    value: entry.value?.toString() ?? null,
    observed_on: entry.observedOn ? date(entry.observedOn) : null,
    note: entry.note,
    revision: entry.revision,
    snapshot: entry.snapshot,
    created_at: entry.createdAt.toISOString(),
  };
}
async function membership(tx: Tx, teamId: string, userId: string) {
  const rows = await tx.$queryRaw<
    { role: string }[]
  >`SELECT role FROM team_members WHERE team_id=${teamId}::uuid AND user_id=${userId}::uuid FOR SHARE`;
  return rows[0]?.role ?? fail("forbidden", "You are not a member of this workspace.", 403);
}
async function actorName(tx: Tx, userId: string) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, displayName: true },
  });
  return user.displayName || user.username;
}
async function goalFor(tx: Tx, teamId: string, goalId: string, userId: string, lock: boolean) {
  // Scope the lookup to both workspace and current visibility before disclosing a goal.
  const goal = await tx.kpiGoal.findFirst({
    where: { id: goalId, teamId, OR: [{ scope: "team" }, { ownerId: userId }] },
    include,
  });
  if (!goal) return fail("not_found", "KPI not found in this workspace.", 404);
  if (lock) {
    await tx.$queryRaw`SELECT id FROM kpi_goals WHERE id=${goalId}::uuid FOR UPDATE`;
    const locked = await tx.kpiGoal.findUniqueOrThrow({ where: { id: goalId }, include });
    if (!canRead(locked, userId)) return fail("not_found", "KPI not found in this workspace.", 404);
    return locked;
  }
  return goal;
}
async function participants(
  tx: Tx,
  teamId: string,
  scope: string,
  actor: string,
  owner: string,
  contributors: string[]
) {
  if (scope === "personal" && (owner !== actor || contributors.length))
    fail(
      "kpi_goal_invalid_input",
      "Personal KPIs must belong to you and cannot have contributors."
    );
  const ids = [...new Set([owner, ...contributors])];
  const members = await tx.$queryRaw<
    { user_id: string }[]
  >`SELECT user_id FROM team_members WHERE team_id=${teamId}::uuid AND user_id=ANY(${ids}::uuid[]) FOR SHARE`;
  if (members.length !== ids.length)
    fail("kpi_goal_invalid_input", "The owner and contributors must be current workspace members.");
  return actorName(tx, owner);
}
function revision(goal: Goal, expected: number) {
  if (goal.revision !== expected)
    fail(
      "kpi_goal_revision_conflict",
      "This KPI changed. Refresh it before submitting your update.",
      409
    );
}
function replay(
  entry: Prisma.KpiGoalEntryGetPayload<Record<string, never>>,
  userId: string,
  requestHash: string,
  kind: string
) {
  if (entry.authorId !== userId || entry.requestHash !== requestHash || entry.kind !== kind)
    fail(
      "kpi_goal_idempotency_conflict",
      "This request ID was already used for a different update.",
      409
    );
  return { goal: entry.snapshot, entry: toEntry(entry) };
}
async function record(
  tx: Tx,
  goal: Goal,
  userId: string,
  role: string,
  requestId: string,
  requestHash: string,
  kind: string,
  note: string,
  value?: Prisma.Decimal,
  observedOn?: Date
) {
  const dto = toGoal(goal, userId, role);
  const entry = await tx.kpiGoalEntry.create({
    data: {
      goalId: goal.id,
      authorId: userId,
      authorName: await actorName(tx, userId),
      kind,
      note,
      value: value ?? null,
      observedOn: observedOn ?? null,
      revision: goal.revision,
      snapshot: dto,
      requestId,
      requestHash,
    },
  });
  return { goal: dto, entry: toEntry(entry) };
}
export async function listKpiGoals(userId: string, teamId: string, cursor?: string, limit = 20) {
  return prisma.$transaction(async (tx) => {
    const role = await membership(tx, teamId, userId);
    const where = { teamId, OR: [{ scope: "team" }, { ownerId: userId }] };
    if (cursor && !(await tx.kpiGoal.findFirst({ where: { ...where, id: cursor } })))
      fail("kpi_goal_invalid_input", "The KPI page is no longer available. Refresh the list.");
    const goals = await tx.kpiGoal.findMany({
      where,
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const members = await tx.teamMember.findMany({
      where: { teamId },
      select: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: { joinedAt: "asc" },
    });
    const team = await tx.team.findUniqueOrThrow({ where: { id: teamId }, select: { kind: true } });
    return {
      goals: goals.slice(0, limit).map((g) => toGoal(g, userId, role)),
      members: members.map((m) => ({ id: m.user.id, name: m.user.displayName || m.user.username })),
      can_create_team: role === "owner" && team.kind === "team",
      next_cursor: goals.length > limit ? (goals[limit - 1]?.id ?? null) : null,
    };
  });
}
export async function createKpiGoal(
  userId: string,
  teamId: string,
  input: Create,
  previous?: { goalId: string; expectedRevision: number }
) {
  return prisma.$transaction(async (tx) => {
    const role = await membership(tx, teamId, userId);
    // Serializes identical creates, including requests reaching different processes.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"kpi-goal:" + input.request_id},0))::text`;
    const requestHash = hash({ teamId, ...input, ...(previous ? { previous } : {}) });
    const existing = await tx.kpiGoal.findUnique({ where: { requestId: input.request_id } });
    if (existing) {
      if (
        existing.creatorId !== userId ||
        existing.requestHash !== requestHash ||
        existing.teamId !== teamId
      )
        fail(
          "kpi_goal_idempotency_conflict",
          "This request ID was already used for a different KPI.",
          409
        );
      await goalFor(tx, teamId, existing.id, userId, false);
      const event = await tx.kpiGoalEntry.findUniqueOrThrow({
        where: { goalId_requestId: { goalId: existing.id, requestId: input.request_id } },
      });
      return replay(event, userId, requestHash, "created");
    }
    if (previous) {
      const source = await goalFor(tx, teamId, previous.goalId, userId, true);
      if (!canManage(source, userId, role))
        fail("forbidden", "You cannot create a period for this KPI.", 403);
      revision(source, previous.expectedRevision);
      if (source.nextPeriod)
        fail("kpi_goal_period_exists", "The next period already exists. Refresh to open it.", 409);
      if (
        input.scope !== source.scope ||
        input.measurement !== source.measurement ||
        input.unit !== source.unit
      )
        fail(
          "kpi_goal_invalid_input",
          "Keep the same visibility, measurement and unit when creating the next period."
        );
      if (input.start_date <= date(source.endDate))
        fail("kpi_goal_invalid_input", "The new period must start after the previous period ends.");
    }
    if (input.scope === "team") {
      const team = await tx.team.findUniqueOrThrow({
        where: { id: teamId },
        select: { kind: true },
      });
      if (role !== "owner" || team.kind !== "team")
        fail(
          "forbidden",
          "Only the team owner can create a shared KPI. Invite a teammate first if this is a personal workspace.",
          403
        );
    }
    const baseline = new Prisma.Decimal(input.baseline),
      target = new Prisma.Decimal(input.target);
    if (baseline.eq(target))
      fail("kpi_goal_invalid_input", "The target must differ from the starting value.");
    if (input.end_date < input.start_date)
      fail("kpi_goal_invalid_input", "The end date must be on or after the start date.");
    if (input.measurement === "money" && !/^[A-Z]{3}$/.test(input.unit ?? ""))
      fail("kpi_goal_invalid_input", "Choose a three-letter currency code, such as MYR or USD.");
    if (input.measurement === "percentage" && [baseline, target].some((v) => v.lt(0) || v.gt(100)))
      fail("kpi_goal_invalid_input", "Percentage values must be between 0 and 100.");
    const ownerName = await participants(
      tx,
      teamId,
      input.scope,
      userId,
      input.owner_id,
      input.contributor_ids
    );
    let goal = await tx.kpiGoal.create({
      data: {
        teamId,
        creatorId: userId,
        ownerId: input.owner_id,
        ownerName,
        name: input.name,
        scope: input.scope,
        measurement: input.measurement,
        unit: input.measurement === "percentage" ? "%" : input.unit,
        baseline,
        target,
        startDate: new Date(input.start_date),
        endDate: new Date(input.end_date),
        requestId: input.request_id,
        requestHash,
        previousGoalId: previous?.goalId ?? null,
      },
      include,
    });
    if (input.contributor_ids.length) {
      await tx.kpiGoalContributor.createMany({
        data: input.contributor_ids.map((userId) => ({ goalId: goal.id, teamId, userId })),
      });
      goal = await tx.kpiGoal.findUniqueOrThrow({ where: { id: goal.id }, include });
    }
    return record(
      tx,
      goal,
      userId,
      role,
      input.request_id,
      requestHash,
      "created",
      "KPI created. Target and period are fixed for this goal; create a new goal for a different reporting period."
    );
  });
}
export function createKpiPeriod(
  userId: string,
  teamId: string,
  goalId: string,
  input: z.infer<typeof createKpiPeriodSchema>
) {
  const { expected_revision, ...draft } = input;
  return createKpiGoal(userId, teamId, draft, { goalId, expectedRevision: expected_revision });
}

export async function kpiGoalPeriods(userId: string, teamId: string, goalId: string) {
  return prisma.$transaction(
    async (tx) => {
      const role = await membership(tx, teamId, userId);
      const goal = await goalFor(tx, teamId, goalId, userId, false);
      const previous = goal.previousGoalId
        ? await goalFor(tx, teamId, goal.previousGoalId, userId, false)
        : null;
      const next = goal.nextPeriod
        ? await goalFor(tx, teamId, goal.nextPeriod.id, userId, false)
        : null;
      return {
        goal: toGoal(goal, userId, role),
        previous: previous ? toGoal(previous, userId, role) : null,
        next: next ? toGoal(next, userId, role) : null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}
export async function mutateKpiGoal(
  userId: string,
  teamId: string,
  goalId: string,
  command: { kind: "check_in"; data: CheckIn } | { kind: "details_changed"; data: Update }
) {
  return prisma.$transaction(async (tx) => {
    const role = await membership(tx, teamId, userId);
    let goal = await goalFor(tx, teamId, goalId, userId, true);
    const input = command.data,
      requestHash = hash(command);
    const previous = await tx.kpiGoalEntry.findUnique({
      where: { goalId_requestId: { goalId, requestId: input.request_id } },
    });
    const allowed =
      command.kind === "check_in" ? canCheckIn(goal, userId, role) : canManage(goal, userId, role);
    if (previous) {
      // Archived/changed goals can replay the owner's earlier outcome, but current
      // visibility and membership are still checked before exposing that snapshot.
      return replay(previous, userId, requestHash, command.kind);
    }
    if (!allowed)
      fail(
        "forbidden",
        goal.archived
          ? "Archived KPIs do not accept check-ins."
          : "You need permission to update this KPI.",
        403
      );
    revision(goal, input.expected_revision);
    if (command.kind === "check_in") {
      const value = new Prisma.Decimal(command.data.value),
        observed = new Date(command.data.observed_on);
      const [{ today }] = await tx.$queryRaw<
        { today: Date }[]
      >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS today`;
      if (!today || observed > today || observed < goal.startDate || observed > goal.endDate)
        fail(
          "kpi_goal_invalid_input",
          "The observation date must be within this KPI's period and cannot be in the future."
        );
      if (goal.measurement === "percentage" && (value.lt(0) || value.gt(100)))
        fail("kpi_goal_invalid_input", "Percentage values must be between 0 and 100.");
      const newest = !goal.lastObservedOn || observed >= goal.lastObservedOn;
      goal = await tx.kpiGoal.update({
        where: { id: goalId },
        data: {
          revision: { increment: 1 },
          lastCheckInAt: new Date(),
          ...(newest ? { currentValue: value, lastObservedOn: observed } : {}),
        },
        include,
      });
      return record(
        tx,
        goal,
        userId,
        role,
        input.request_id,
        requestHash,
        command.kind,
        command.data.note,
        value,
        observed
      );
    }
    const ownerName = await participants(
      tx,
      teamId,
      goal.scope,
      userId,
      command.data.owner_id,
      command.data.contributor_ids
    );
    await tx.kpiGoalContributor.deleteMany({ where: { goalId } });
    if (command.data.contributor_ids.length)
      await tx.kpiGoalContributor.createMany({
        data: command.data.contributor_ids.map((userId) => ({ goalId, teamId, userId })),
      });
    goal = await tx.kpiGoal.update({
      where: { id: goalId },
      data: {
        name: command.data.name,
        ownerId: command.data.owner_id,
        ownerName,
        archived: command.data.archived,
        revision: { increment: 1 },
      },
      include,
    });
    return record(
      tx,
      goal,
      userId,
      role,
      input.request_id,
      requestHash,
      command.kind,
      "KPI ownership, contributors or archive details updated."
    );
  });
}
export async function kpiGoalHistory(
  userId: string,
  teamId: string,
  goalId: string,
  cursor?: string,
  limit = 20
) {
  return prisma.$transaction(async (tx) => {
    await membership(tx, teamId, userId);
    await goalFor(tx, teamId, goalId, userId, false);
    const entries = await tx.kpiGoalEntry.findMany({
      where: { goalId, ...(cursor ? { sequence: { lt: BigInt(cursor) } } : {}) },
      orderBy: { sequence: "desc" },
      take: limit + 1,
    });
    return {
      entries: entries.slice(0, limit).map(toEntry),
      next_cursor:
        entries.length > limit ? (entries[limit - 1]?.sequence.toString() ?? null) : null,
    };
  });
}

export async function getKpiGoal(userId: string, teamId: string, goalId: string) {
  return prisma.$transaction(async (tx) => {
    const role = await membership(tx, teamId, userId);
    return { goal: toGoal(await goalFor(tx, teamId, goalId, userId, false), userId, role) };
  });
}

const reviewCursor = schema
  .object({
    goal: schema.uuid(),
    revision: schema.number().int().positive(),
    before: schema.iso.date(),
  })
  .strict();

export async function kpiGoalReview(
  userId: string,
  teamId: string,
  goalId: string,
  cursor?: string
) {
  return prisma.$transaction(
    async (tx) => {
      const role = await membership(tx, teamId, userId);
      const goal = await goalFor(tx, teamId, goalId, userId, false);
      let before: Date | null = null;
      if (cursor) {
        let decoded: unknown;
        try {
          decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        } catch {
          fail("kpi_goal_invalid_input", "This review page is invalid. Refresh the review.");
        }
        const parsed = reviewCursor.safeParse(decoded);
        if (!parsed.success || parsed.data.goal !== goalId)
          return fail("kpi_goal_invalid_input", "This review page is invalid. Refresh the review.");
        revision(goal, parsed.data.revision);
        before = new Date(parsed.data.before);
      }
      // Corrections replace the plotted observation for a date, never its history.
      // Repeatable read keeps the goal revision and observations in one snapshot.
      const points = await tx.$queryRaw<
        {
          id: string;
          observed_on: Date;
          value: Prisma.Decimal;
          author_name: string;
          note: string;
          created_at: Date;
        }[]
      >`SELECT DISTINCT ON (observed_on) id, observed_on, value, author_name, note, created_at
      FROM kpi_goal_entries WHERE goal_id=${goalId}::uuid AND kind='check_in'
      AND (${before}::date IS NULL OR observed_on < ${before}::date)
      ORDER BY observed_on DESC, sequence DESC LIMIT 31`;
      const [{ today }] = await tx.$queryRaw<
        { today: Date }[]
      >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS today`;
      const last = points[29];
      return {
        goal: toGoal(goal, userId, role),
        as_of: date(today),
        observations: points.slice(0, 30).map((point) => ({
          id: point.id,
          observed_on: date(point.observed_on),
          value: point.value.toString(),
          progress: numericGoalProgress(
            goal.baseline.toString(),
            goal.target.toString(),
            point.value.toString()
          ),
          author_name: point.author_name,
          note: point.note,
          recorded_at: point.created_at.toISOString(),
        })),
        next_cursor:
          points.length > 30 && last
            ? Buffer.from(
                JSON.stringify({
                  goal: goalId,
                  revision: goal.revision,
                  before: date(last.observed_on),
                })
              ).toString("base64url")
            : null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}
