const id = "11111111-1111-4111-8111-111111111111",
  owner = "22222222-2222-4222-8222-222222222222";
export const goal = {
  id,
  team_id: id,
  name: "Monthly sales",
  scope: "team",
  measurement: "money",
  owner_id: owner,
  owner_name: "Alex",
  contributor_ids: [],
  unit: "MYR",
  baseline: "0",
  target: "20000",
  current_value: null,
  start_date: "2026-10-01",
  end_date: "2026-10-31",
  last_observed_on: null,
  last_check_in_at: null,
  archived: false,
  revision: 1,
  progress: null,
  can_manage: true,
  can_check_in: true,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  previous_goal_id: null,
  next_goal_id: null,
  can_create_period: true,
};
export const entry = {
  id,
  sequence: "1",
  kind: "created",
  author_name: "Alex",
  value: null,
  observed_on: null,
  note: "KPI created",
  revision: 1,
  snapshot: goal,
  created_at: goal.created_at,
};
export const list = {
  goals: [goal],
  members: [{ id: owner, name: "Alex" }],
  can_create_team: true,
  next_cursor: null,
};
export const result = { goal, entry };
export const history = { entries: [entry], next_cursor: null };

export const review = { goal, as_of: "2026-10-29", observations: [], next_cursor: null };

export const periods = { goal, previous: null, next: null };
