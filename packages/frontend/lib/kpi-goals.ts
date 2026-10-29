import { z } from "zod";
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const kpiGoalSchema = z.object({
  id: z.uuid(),
  team_id: z.uuid(),
  name: z.string(),
  scope: z.enum(["personal", "team"]),
  measurement: z.enum(["number", "percentage", "money"]),
  owner_id: z.uuid().nullable(),
  owner_name: z.string(),
  contributor_ids: z.array(z.uuid()),
  unit: z.string().nullable(),
  baseline: decimal,
  target: decimal,
  current_value: decimal.nullable(),
  start_date: z.iso.date(),
  end_date: z.iso.date(),
  last_observed_on: z.iso.date().nullable(),
  last_check_in_at: z.iso.datetime().nullable(),
  archived: z.boolean(),
  revision: z.number().int().positive(),
  progress: z.number().min(0).max(100).nullable(),
  can_manage: z.boolean(),
  can_check_in: z.boolean(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  previous_goal_id: z.uuid().nullable().default(null),
  next_goal_id: z.uuid().nullable().default(null),
  can_create_period: z.boolean().default(false),
});
export const kpiGoalEntrySchema = z.object({
  id: z.uuid(),
  sequence: z.string().regex(/^\d+$/),
  kind: z.enum(["created", "check_in", "details_changed"]),
  author_name: z.string(),
  value: decimal.nullable(),
  observed_on: z.iso.date().nullable(),
  note: z.string(),
  revision: z.number().int().positive(),
  snapshot: kpiGoalSchema,
  created_at: z.iso.datetime(),
});
export const kpiGoalListSchema = z.object({
  goals: z.array(kpiGoalSchema),
  members: z.array(z.object({ id: z.uuid(), name: z.string() })),
  can_create_team: z.boolean(),
  next_cursor: z.uuid().nullable(),
});
export const kpiGoalResultSchema = z.object({ goal: kpiGoalSchema, entry: kpiGoalEntrySchema });
export const kpiGoalHistorySchema = z.object({
  entries: z.array(kpiGoalEntrySchema),
  next_cursor: z.string().regex(/^\d+$/).nullable(),
});
export const kpiGoalReviewSchema = z.object({
  goal: kpiGoalSchema,
  as_of: z.iso.date(),
  observations: z.array(
    z.object({
      id: z.uuid(),
      observed_on: z.iso.date(),
      value: decimal,
      progress: z.number().min(0).max(100),
      author_name: z.string(),
      note: z.string(),
      recorded_at: z.iso.datetime(),
    })
  ),
  next_cursor: z.string().nullable(),
});
export const kpiGoalPeriodsSchema = z.object({
  goal: kpiGoalSchema,
  previous: kpiGoalSchema.nullable(),
  next: kpiGoalSchema.nullable(),
});
export type KpiGoalPeriods = z.infer<typeof kpiGoalPeriodsSchema>;
export type KpiGoalReview = z.infer<typeof kpiGoalReviewSchema>;
export type KpiGoal = z.infer<typeof kpiGoalSchema>;
export type KpiGoalEntry = z.infer<typeof kpiGoalEntrySchema>;
export type KpiGoalList = z.infer<typeof kpiGoalListSchema>;
export type CreateKpiGoalInput = Pick<
  KpiGoal,
  | "name"
  | "scope"
  | "measurement"
  | "unit"
  | "baseline"
  | "target"
  | "start_date"
  | "end_date"
  | "contributor_ids"
> & { owner_id: string; request_id: string };
export type UpdateKpiGoalInput = Pick<KpiGoal, "name" | "contributor_ids" | "archived"> & {
  owner_id: string;
  expected_revision: number;
  request_id: string;
};
export type CreateKpiPeriodInput = CreateKpiGoalInput & { expected_revision: number };
export type KpiGoalCheckInInput = {
  request_id: string;
  expected_revision: number;
  value: string;
  observed_on: string;
  note: string;
};
export function goalValue(goal: Pick<KpiGoal, "measurement" | "unit">, value: string) {
  const [whole = "0", fraction = ""] = value.split(".");
  const tail = fraction.replace(/0+$/, "");
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (tail ? `.${tail}` : "");
  return goal.measurement === "money"
    ? `${goal.unit} ${formatted}`
    : goal.measurement === "percentage"
      ? `${formatted}%`
      : `${formatted}${goal.unit ? ` ${goal.unit}` : ""}`;
}
export function goalState(goal: KpiGoal, today = new Date().toISOString().slice(0, 10)) {
  if (goal.archived) return "Archived";
  if (goal.progress === 100) return "Target reached";
  if (today < goal.start_date) return "Starts soon";
  if (today > goal.end_date) return "Period ended";
  return goal.current_value === null ? "No check-ins" : "In progress";
}
export function goalPeriod(goal: Pick<KpiGoal, "start_date" | "end_date">) {
  const format = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
  return `${format.format(new Date(goal.start_date + "T00:00:00Z"))} – ${format.format(new Date(goal.end_date + "T00:00:00Z"))}`;
}
