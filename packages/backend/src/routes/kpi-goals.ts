import { Hono } from "hono";
import { z } from "zod";
import type { Vars } from "../middleware/auth.ts";
import { validate } from "../lib/validate.ts";
import {
  createKpiGoalSchema,
  checkInKpiGoalSchema,
  updateKpiGoalSchema,
  createKpiPeriodSchema,
} from "../lib/validation.ts";
import {
  createKpiGoal,
  listKpiGoals,
  mutateKpiGoal,
  kpiGoalHistory,
  kpiGoalReview,
  createKpiPeriod,
  kpiGoalPeriods,
  getKpiGoal,
  KpiGoalError,
} from "../lib/kpi-goals.ts";
import { dbErrorInfo } from "../lib/db-error.ts";
export const kpiGoalRoutes = new Hono<{ Variables: Vars }>();
kpiGoalRoutes.onError((error, c) => {
  if (error instanceof KpiGoalError)
    return c.json({ error: error.code, message: error.message }, error.status);
  if (dbErrorInfo(error).code === "P2034")
    return c.json(
      { error: "kpi_goal_retry", message: "The update was rolled back. Retry the same request." },
      409
    );
  throw error;
});
kpiGoalRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
const workspace = z.object({ workspace: z.uuid() });
const goalParams = workspace.extend({ goal: z.uuid() });
kpiGoalRoutes.get(
  "/teams/:workspace/kpi-goals/:goal/periods",
  validate("param", goalParams),
  async (c) =>
    c.json(
      await kpiGoalPeriods(
        c.get("userId"),
        c.req.valid("param").workspace,
        c.req.valid("param").goal
      )
    )
);
kpiGoalRoutes.post(
  "/teams/:workspace/kpi-goals/:goal/periods",
  validate("param", goalParams),
  validate("json", createKpiPeriodSchema),
  async (c) =>
    c.json(
      await createKpiPeriod(
        c.get("userId"),
        c.req.valid("param").workspace,
        c.req.valid("param").goal,
        c.req.valid("json")
      ),
      201
    )
);
const boundedLimit = z.coerce.number().int().min(1).max(20).default(20);
const page = z.object({ cursor: z.uuid().optional(), limit: boundedLimit });
const historyPage = z.object({
  limit: boundedLimit,
  cursor: z
    .string()
    .regex(/^\d{1,18}$/)
    .optional(),
});
kpiGoalRoutes.get("/teams/:workspace/kpi-goals/:goal", validate("param", goalParams), async (c) =>
  c.json(
    await getKpiGoal(c.get("userId"), c.req.valid("param").workspace, c.req.valid("param").goal)
  )
);
const reviewPage = z
  .object({
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,350}$/)
      .optional(),
  })
  .strict();
kpiGoalRoutes.get(
  "/teams/:workspace/kpi-goals/:goal/review",
  validate("param", goalParams),
  validate("query", reviewPage),
  async (c) =>
    c.json(
      await kpiGoalReview(
        c.get("userId"),
        c.req.valid("param").workspace,
        c.req.valid("param").goal,
        c.req.valid("query").cursor
      )
    )
);
kpiGoalRoutes.get(
  "/teams/:workspace/kpi-goals",
  validate("param", workspace),
  validate("query", page),
  async (c) =>
    c.json(
      await listKpiGoals(
        c.get("userId"),
        c.req.valid("param").workspace,
        c.req.valid("query").cursor,
        c.req.valid("query").limit
      )
    )
);
kpiGoalRoutes.post(
  "/teams/:workspace/kpi-goals",
  validate("param", workspace),
  validate("json", createKpiGoalSchema),
  async (c) =>
    c.json(
      await createKpiGoal(c.get("userId"), c.req.valid("param").workspace, c.req.valid("json")),
      201
    )
);
kpiGoalRoutes.post(
  "/teams/:workspace/kpi-goals/:goal/check-ins",
  validate("param", goalParams),
  validate("json", checkInKpiGoalSchema),
  async (c) =>
    c.json(
      await mutateKpiGoal(
        c.get("userId"),
        c.req.valid("param").workspace,
        c.req.valid("param").goal,
        { kind: "check_in", data: c.req.valid("json") }
      )
    )
);
kpiGoalRoutes.patch(
  "/teams/:workspace/kpi-goals/:goal",
  validate("param", goalParams),
  validate("json", updateKpiGoalSchema),
  async (c) =>
    c.json(
      await mutateKpiGoal(
        c.get("userId"),
        c.req.valid("param").workspace,
        c.req.valid("param").goal,
        { kind: "details_changed", data: c.req.valid("json") }
      )
    )
);
kpiGoalRoutes.get(
  "/teams/:workspace/kpi-goals/:goal/history",
  validate("param", goalParams),
  validate("query", historyPage),
  async (c) =>
    c.json(
      await kpiGoalHistory(
        c.get("userId"),
        c.req.valid("param").workspace,
        c.req.valid("param").goal,
        c.req.valid("query").cursor,
        c.req.valid("query").limit
      )
    )
);
