# PRD-10 — Task Ownership & Assignment

## 1. Goal

Tasks had no owner or assignee — they belonged to a container and nobody
individually. This PRD adds both: an immutable **creator** (the task's owner)
and a mutable **assignee**, assignable by any container member to any container
member (owner answers: "any member can assign to anyone"; "owner of the task is
creator"). Assignment notifies the assignee over PRD-05.

## 2. Data

Migration `20260904150000_task_creator_assignee`: two nullable UUID columns on
`tasks` + FKs to users (ON DELETE SET NULL — future account deletion keeps the
task) + an `assignee_id` index.

    creator_id  — immutable, set at creation, null for tasks predating the
                  column (honest: we don't invent history)
    assignee_id — mutable; must be a member of the task's container
                  (route-enforced — mirrors the binding rule that nothing
                  points across containers)

## 3. Rules

- **Any member** assigns to **any member** — self, leader, creator, whoever.
  No hierarchy (owner answer 1). Clearing is always allowed.
- **Creator** is set once by the API (the authed user at creation) and never
  changed by anyone.
- **Assignment notifies**: a new assignee (≠ actor, ≠ previous assignee)
  gets a `task_assigned` PRD-05 notification — best-effort, like every
  generator. Self-assignment and no-op re-assignment are silent.
- `assignee_not_member` — new API error code, surfaces the container rule.

## 4. API surface

- `POST /teams/:id/tasks` accepts `assignee_id` (optional) and stamps
  `creator_id`.
- `PATCH /tasks/:id` accepts `assignee_id` (member-validated; null clears).
- Every task response now carries `creator` and `assignee` as
  `{ id, username, display_name } | null`.

## 5. Frontend

- **Drawer**: an `AssigneeChip` (ProjectChip pattern — Dropdown + MenuItem +
  checkmark-only) next to Project/KPI chips: avatar-initial, member list with
  leader/you markers, "Unassigned" to clear. The member list is fetched by the
  drawer (not page data) via `GET /teams/:id`, refreshed when the drawer's
  container changes (documented effect). A **Created by** line sits under the
  title ("(you)" for self).
- **Task row**: a 20px avatar-initial chip (tooltip = name) before the due
  date, rendered only when assigned.
- **Notifications**: `task_assigned` rows render with the @ icon and
  "_actor_ assigned you to _task_" copy; deep-links into the payload's
  container.

## 6. Non-goals / later

- Filter the board by assignee; assignment at creation time in the
  New-task modal (the API already accepts it); assignment history; reminders
  keyed to the assignee (PRD-05 phase 2).

## 7. Migration note

`prisma migrate dev` hung interactively on this schema change — the migration
is hand-written SQL (house style: dated folder + commented DDL), applied via
`migrate deploy`. Same pattern as PRD-05's migration.
