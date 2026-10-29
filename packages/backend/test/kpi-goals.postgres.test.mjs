import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
const url = process.env.KPI_GOALS_TEST_DATABASE_URL;
if (!url) {
  test(
    "business KPI integration requires an isolated KPI_GOALS_TEST_DATABASE_URL",
    { skip: true },
    () => {}
  );
} else {
  if (!/(?:kpi|agent)_qa$/.test(new URL(url).pathname))
    throw Error("Use an isolated kpi_qa database");
  process.env.DATABASE_URL = url;
  process.env.ENV = "development";
  const { prisma: db } = await import("../src/db.ts");
  const {
    createKpiGoal,
    listKpiGoals,
    mutateKpiGoal,
    kpiGoalHistory,
    kpiGoalReview,
    createKpiPeriod,
    kpiGoalPeriods,
  } = await import("../src/lib/kpi-goals.ts");
  const { numericGoalProgress } = await import("../src/lib/kpi-goal-progress.ts");
  const { kpiGoalRoutes } = await import("../src/routes/kpi-goals.ts");
  const { kpiRoutes } = await import("../src/routes/kpis.ts");
  const owner = randomUUID(),
    member = randomUUID(),
    reader = randomUUID(),
    stranger = randomUUID(),
    team = randomUUID(),
    other = randomUUID();
  const today = new Date().toISOString().slice(0, 10),
    start = today.slice(0, 4) + "-01-01",
    end = today.slice(0, 4) + "-12-31";
  const create = (patch = {}) => ({
    request_id: randomUUID(),
    name: "Monthly sales",
    scope: "team",
    measurement: "money",
    unit: "MYR",
    baseline: "0",
    target: "20000",
    start_date: start,
    end_date: end,
    owner_id: owner,
    contributor_ids: [member],
    ...patch,
  });
  const check = (goal, value = "5000", patch = {}) => ({
    kind: "check_in",
    data: {
      request_id: randomUUID(),
      expected_revision: goal.revision,
      value,
      observed_on: today,
      note: "Actual sales total",
      ...patch,
    },
  });
  const update = (goal, patch = {}) => ({
    kind: "details_changed",
    data: {
      request_id: randomUUID(),
      expected_revision: goal.revision,
      name: goal.name,
      owner_id: owner,
      contributor_ids: [member],
      archived: false,
      ...patch,
    },
  });
  const code = (expected) => (e) => e.code === expected;
  function appFor(userId, routes = kpiGoalRoutes) {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("userId", userId);
      await next();
    });
    app.route("/", routes);
    return app;
  }
  test("business KPIs use actual PostgreSQL transactions", async (t) => {
    await db.user.createMany({
      data: [owner, member, reader, stranger].map((id, i) => ({
        id,
        username: `kpi_${id.slice(0, 8)}_${i}`,
      })),
    });
    await db.team.create({
      data: {
        id: team,
        name: "KPI QA",
        slug: `kpi-${team}`,
        ownerId: owner,
        kind: "team",
        members: {
          create: [{ userId: owner, role: "owner" }, { userId: member }, { userId: reader }],
        },
      },
    });
    await db.team.create({
      data: {
        id: other,
        name: "Foreign",
        slug: `kpi-${other}`,
        ownerId: stranger,
        members: { create: { userId: stranger, role: "owner" } },
      },
    });
    try {
      await t.test("legacy weighted KPIs keep the same calculation", async () => {
        const kpi = await db.kpi.create({ data: { teamId: team, ownerId: owner, name: "Legacy" } });
        for (const [status, weight] of [
          ["done", 50],
          ["in_progress", 30],
          ["todo", 20],
          ["canceled", 100],
        ]) {
          const task = await db.task.create({
            data: { teamId: team, creatorId: owner, title: status, status },
          });
          await db.taskKpi.create({ data: { taskId: task.id, kpiId: kpi.id, weight } });
        }
        const response = await appFor(owner, kpiRoutes).request(`/teams/${team}/kpis/progress`);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).kpis.find((k) => k.id === kpi.id).progress, 65);
      });
      await t.test("manual KPI starts unreported and does not alter legacy records", async () => {
        const { goal } = await createKpiGoal(owner, team, create());
        assert.equal(goal.current_value, null);
        assert.equal(goal.progress, null);
        assert.equal(await db.kpi.count({ where: { teamId: team } }), 1);
        const history = await kpiGoalHistory(owner, team, goal.id);
        assert.equal(history.entries[0].kind, "created");
      });
      await t.test(
        "personal goals are private and shared creation is owner controlled",
        async () => {
          const { goal } = await createKpiGoal(
            member,
            team,
            create({ scope: "personal", owner_id: member, contributor_ids: [] })
          );
          assert.equal(
            (await listKpiGoals(owner, team)).goals.some((g) => g.id === goal.id),
            false
          );
          await assert.rejects(() => kpiGoalHistory(owner, team, goal.id), code("not_found"));
          await assert.rejects(() => createKpiGoal(member, team, create()), code("forbidden"));
          await assert.rejects(
            () =>
              createKpiGoal(
                owner,
                team,
                create({ scope: "personal", owner_id: member, contributor_ids: [] })
              ),
            code("kpi_goal_invalid_input")
          );
        }
      );
      await t.test("foreign members, contributors and workspaces are rejected", async () => {
        await assert.rejects(() => listKpiGoals(stranger, team), code("forbidden"));
        await assert.rejects(
          () => createKpiGoal(owner, team, create({ owner_id: stranger })),
          code("kpi_goal_invalid_input")
        );
        await assert.rejects(
          () => createKpiGoal(owner, team, create({ contributor_ids: [stranger] })),
          code("kpi_goal_invalid_input")
        );
        const { goal } = await createKpiGoal(owner, team, create());
        await assert.rejects(() => kpiGoalHistory(stranger, other, goal.id), code("not_found"));
      });
      await t.test("invalid ranges, percentages and currency are rejected", async () => {
        for (const patch of [
          { baseline: "5", target: "5" },
          { start_date: end, end_date: start },
          { measurement: "percentage", baseline: "-1" },
          { measurement: "percentage", target: "101" },
          { unit: "RM" },
          { measurement: "money", unit: null },
        ])
          await assert.rejects(
            () => createKpiGoal(owner, team, create(patch)),
            code("kpi_goal_invalid_input")
          );
      });
      await t.test(
        "same create request atomically creates one goal and original result",
        async () => {
          const input = create();
          const [first, second] = await Promise.all([
            createKpiGoal(owner, team, input),
            createKpiGoal(owner, team, input),
          ]);
          assert.deepEqual(first, second);
          assert.equal(await db.kpiGoal.count({ where: { requestId: input.request_id } }), 1);
          await assert.rejects(
            () => createKpiGoal(owner, team, { ...input, name: "Changed" }),
            code("kpi_goal_idempotency_conflict")
          );
        }
      );
      await t.test("named contributor can check in; readers cannot", async () => {
        const { goal } = await createKpiGoal(owner, team, create());
        await assert.rejects(
          () => mutateKpiGoal(reader, team, goal.id, check(goal)),
          code("forbidden")
        );
        const result = await mutateKpiGoal(member, team, goal.id, check(goal));
        assert.equal(result.goal.current_value, "5000");
        assert.equal(result.goal.progress, 25);
        assert.equal(result.entry.author_name.length > 0, true);
      });
      await t.test("concurrent stale writes have exactly one successful result", async () => {
        const { goal } = await createKpiGoal(owner, team, create());
        const results = await Promise.allSettled([
          mutateKpiGoal(owner, team, goal.id, check(goal, "6000")),
          mutateKpiGoal(member, team, goal.id, check(goal, "9000")),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          results.find((r) => r.status === "rejected").reason.code,
          "kpi_goal_revision_conflict"
        );
        assert.equal(
          await db.kpiGoalEntry.count({ where: { goalId: goal.id, kind: "check_in" } }),
          1
        );
      });
      await t.test(
        "concurrent identical retries produce one check-in; changed payload conflicts",
        async () => {
          const { goal } = await createKpiGoal(owner, team, create());
          const input = check(goal, "1234.5678");
          const [a, b] = await Promise.all([
            mutateKpiGoal(owner, team, goal.id, input),
            mutateKpiGoal(owner, team, goal.id, input),
          ]);
          assert.deepEqual(a, b);
          assert.equal(a.goal.current_value, "1234.5678");
          await assert.rejects(
            () =>
              mutateKpiGoal(owner, team, goal.id, {
                ...input,
                data: { ...input.data, value: "2" },
              }),
            code("kpi_goal_idempotency_conflict")
          );
        }
      );
      await t.test("decreasing goals calculate against their starting value", async () => {
        const { goal } = await createKpiGoal(
          owner,
          team,
          create({ measurement: "number", unit: "hours", baseline: "24", target: "12" })
        );
        const halfway = await mutateKpiGoal(owner, team, goal.id, check(goal, "18"));
        assert.equal(halfway.goal.progress, 50);
        const achieved = await mutateKpiGoal(owner, team, goal.id, check(halfway.goal, "10"));
        assert.equal(achieved.goal.progress, 100);
      });
      await t.test("backdated entries never replace newer observations", async () => {
        const { goal } = await createKpiGoal(owner, team, create());
        const current = await mutateKpiGoal(owner, team, goal.id, check(goal, "8000"));
        const older = await mutateKpiGoal(
          owner,
          team,
          goal.id,
          check(current.goal, "1000", { observed_on: start })
        );
        assert.equal(older.goal.current_value, "8000");
        const history = await kpiGoalHistory(owner, team, goal.id);
        assert.equal(history.entries[0].value, "1000");
        assert.equal(history.entries.length, 3);
      });
      await t.test("future/out-of-period dates and invalid percentage check-ins fail", async () => {
        const { goal } = await createKpiGoal(
          owner,
          team,
          create({ measurement: "percentage", unit: "%", target: "95" })
        );
        for (const patch of [
          { observed_on: "2099-01-01" },
          { observed_on: "2020-01-01" },
          { value: "101" },
        ])
          await assert.rejects(
            () => mutateKpiGoal(owner, team, goal.id, check(goal, "20", patch)),
            code("kpi_goal_invalid_input")
          );
      });
      await t.test("ownership changes, archive and replay retain immutable history", async () => {
        const { goal } = await createKpiGoal(owner, team, create());
        const cmd = update(goal, { owner_id: reader, contributor_ids: [], archived: true });
        const result = await mutateKpiGoal(owner, team, goal.id, cmd);
        assert.equal(result.goal.archived, true);
        await assert.rejects(
          () => mutateKpiGoal(reader, team, goal.id, check(result.goal)),
          code("forbidden")
        );
        assert.deepEqual(await mutateKpiGoal(owner, team, goal.id, cmd), result);
        const history = await kpiGoalHistory(reader, team, goal.id);
        assert.equal(history.entries[0].snapshot.owner_id, reader);
        assert.equal(history.entries[1].snapshot.owner_id, owner);
        assert.equal(history.entries[1].snapshot.archived, false);
      });
      await t.test("membership removal revokes check-in and history access", async () => {
        const { goal } = await createKpiGoal(owner, team, create());
        await db.teamMember.delete({ where: { teamId_userId: { teamId: team, userId: member } } });
        await assert.rejects(
          () => mutateKpiGoal(member, team, goal.id, check(goal)),
          code("forbidden")
        );
        await assert.rejects(() => kpiGoalHistory(member, team, goal.id), code("forbidden"));
        await db.teamMember.create({ data: { teamId: team, userId: member } });
      });
      await t.test("history and list pagination continue without duplicates", async () => {
        const { goal } = await createKpiGoal(owner, team, create());
        let current = goal;
        for (let i = 0; i < 22; i++)
          current = (await mutateKpiGoal(owner, team, goal.id, check(current, String(i)))).goal;
        const first = await kpiGoalHistory(owner, team, goal.id),
          second = await kpiGoalHistory(owner, team, goal.id, first.next_cursor);
        assert.equal(first.entries.length, 20);
        assert.equal(second.entries.length, 3);
        assert.equal(new Set([...first.entries, ...second.entries].map((e) => e.id)).size, 23);
        for (let i = 0; i < 12; i++) await createKpiGoal(owner, team, create());
        const list = await listKpiGoals(owner, team);
        assert.ok(list.next_cursor);
        const next = await listKpiGoals(owner, team, list.next_cursor);
        assert.equal(
          new Set([...list.goals, ...next.goals].map((g) => g.id)).size,
          list.goals.length + next.goals.length
        );
      });
      await t.test(
        "review enforces current visibility and has no invented observations",
        async () => {
          const { goal } = await createKpiGoal(owner, team, create());
          const empty = await kpiGoalReview(reader, team, goal.id);
          assert.deepEqual(empty.observations, []);
          assert.equal(empty.as_of, today);
          assert.equal(empty.goal.current_value, null);
          await assert.rejects(() => kpiGoalReview(stranger, team, goal.id), code("forbidden"));
          await assert.rejects(
            () => kpiGoalReview(owner, team, goal.id, "broken"),
            code("kpi_goal_invalid_input")
          );
          const personal = await createKpiGoal(
            member,
            team,
            create({ scope: "personal", owner_id: member, contributor_ids: [] })
          );
          await assert.rejects(
            () => kpiGoalReview(owner, team, personal.goal.id),
            code("not_found")
          );
          await assert.rejects(() => kpiGoalReview(stranger, other, goal.id), code("not_found"));
          await db.teamMember.delete({
            where: { teamId_userId: { teamId: team, userId: reader } },
          });
          await assert.rejects(() => kpiGoalReview(reader, team, goal.id), code("forbidden"));
          await db.teamMember.create({ data: { teamId: team, userId: reader } });
        }
      );
      await t.test("review groups corrections by observation date, not upload time", async () => {
        const earlier = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
        let { goal } = await createKpiGoal(
          owner,
          team,
          create({
            start_date: earlier,
            baseline: "24",
            target: "12",
            measurement: "number",
            unit: "hours",
          })
        );
        goal = (
          await mutateKpiGoal(owner, team, goal.id, check(goal, "18", { observed_on: earlier }))
        ).goal;
        goal = (await mutateKpiGoal(owner, team, goal.id, check(goal, "15"))).goal;
        goal = (
          await mutateKpiGoal(
            owner,
            team,
            goal.id,
            check(goal, "20.1234", { observed_on: earlier, note: "Correction" })
          )
        ).goal;
        await db.kpiGoalEntry.updateMany({
          where: { goalId: goal.id },
          data: { createdAt: new Date(today) },
        });
        const review = await kpiGoalReview(reader, team, goal.id);
        assert.deepEqual(
          review.observations.map((p) => p.observed_on),
          [today, earlier]
        );
        assert.deepEqual(
          review.observations.map((p) => p.value),
          ["15", "20.1234"]
        );
        assert.equal(review.observations[0].progress, 75);
        assert.equal(review.observations[1].note, "Correction");
        assert.equal(review.goal.current_value, "15");
        assert.equal((await kpiGoalHistory(owner, team, goal.id)).entries.length, 4);
      });
      await t.test(
        "review pagination is bounded, revision-aware and rejects cross-goal cursors",
        async () => {
          const dates = Array.from({ length: 35 }, (_, i) =>
            new Date(Date.parse(today) - (34 - i) * 86400000).toISOString().slice(0, 10)
          );
          let { goal } = await createKpiGoal(
            owner,
            team,
            create({ start_date: dates[0], end_date: today })
          );
          for (const [i, observed_on] of dates.entries())
            goal = (
              await mutateKpiGoal(
                owner,
                team,
                goal.id,
                check(goal, String(i * 100), { observed_on })
              )
            ).goal;
          const first = await kpiGoalReview(owner, team, goal.id);
          const second = await kpiGoalReview(owner, team, goal.id, first.next_cursor);
          assert.equal(first.observations.length, 30);
          assert.equal(second.observations.length, 5);
          assert.equal(second.next_cursor, null);
          assert.equal(
            new Set([...first.observations, ...second.observations].map((p) => p.observed_on)).size,
            35
          );
          assert.equal(first.observations[0].observed_on, today);
          const another = await createKpiGoal(owner, team, create());
          await assert.rejects(
            () => kpiGoalReview(owner, team, another.goal.id, first.next_cursor),
            code("kpi_goal_invalid_input")
          );
          const response = await appFor(reader).request(
            `/teams/${team}/kpi-goals/${goal.id}/review`
          );
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("cache-control"), "private, no-store");
          assert.equal((await response.json()).observations.length, 30);
          assert.equal(
            (await appFor(owner).request(`/teams/${team}/kpi-goals/${goal.id}/review?cursor=!!!`))
              .status,
            400
          );
          await mutateKpiGoal(owner, team, goal.id, check(goal, "4000"));
          await assert.rejects(
            () => kpiGoalReview(owner, team, goal.id, first.next_cursor),
            code("kpi_goal_revision_conflict")
          );
        }
      );
      const offset = (days) =>
        new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
      const periodInput = (goal, patch = {}) =>
        create({
          scope: goal.scope,
          measurement: goal.measurement,
          unit: goal.unit,
          baseline: goal.baseline,
          target: goal.target,
          owner_id: goal.owner_id,
          contributor_ids: goal.contributor_ids,
          start_date: new Date(Date.parse(goal.end_date) + 86400000).toISOString().slice(0, 10),
          end_date: new Date(Date.parse(goal.end_date) + 31 * 86400000).toISOString().slice(0, 10),
          expected_revision: goal.revision,
          ...patch,
        });
      await t.test("new periods retain the old result and compare distinct targets", async () => {
        let { goal } = await createKpiGoal(
          owner,
          team,
          create({ start_date: offset(-60), end_date: offset(-31) })
        );
        goal = (
          await mutateKpiGoal(
            owner,
            team,
            goal.id,
            check(goal, "18000", { observed_on: offset(-31) })
          )
        ).goal;
        const original = await kpiGoalHistory(owner, team, goal.id);
        let next = await createKpiPeriod(
          owner,
          team,
          goal.id,
          periodInput(goal, { start_date: offset(-30), end_date: offset(-1), target: "25000" })
        );
        assert.equal(next.goal.current_value, null);
        assert.equal(next.goal.progress, null);
        assert.equal(next.goal.previous_goal_id, goal.id);
        assert.equal(next.goal.archived, false);
        next = await mutateKpiGoal(
          member,
          team,
          next.goal.id,
          check(next.goal, "22000", { observed_on: offset(-1) })
        );
        const compared = await kpiGoalPeriods(reader, team, next.goal.id);
        assert.equal(compared.previous.current_value, "18000");
        assert.equal(compared.previous.target, "20000");
        assert.equal(compared.previous.progress, 90);
        assert.equal(compared.goal.current_value, "22000");
        assert.equal(compared.goal.target, "25000");
        assert.equal(compared.goal.progress, 88);
        assert.equal(compared.previous.can_create_period, false);
        assert.deepEqual(await kpiGoalHistory(owner, team, goal.id), original);
        assert.equal((await kpiGoalPeriods(owner, team, goal.id)).next.id, next.goal.id);
      });
      await t.test("period creation is atomic and replays the original result", async () => {
        const { goal } = await createKpiGoal(owner, team, create());
        const input = periodInput(goal);
        const pair = await Promise.all([
          createKpiPeriod(owner, team, goal.id, input),
          createKpiPeriod(owner, team, goal.id, input),
        ]);
        assert.deepEqual(pair[0], pair[1]);
        assert.equal(pair[0].goal.can_check_in, false);
        assert.equal(await db.kpiGoal.count({ where: { previousGoalId: goal.id } }), 1);
        await assert.rejects(
          () => createKpiPeriod(owner, team, goal.id, { ...input, target: "999" }),
          code("kpi_goal_idempotency_conflict")
        );
        await assert.rejects(
          () => createKpiPeriod(owner, team, goal.id, periodInput(goal)),
          code("kpi_goal_period_exists")
        );
        await mutateKpiGoal(owner, team, goal.id, update(goal, { archived: true }));
        assert.deepEqual(await createKpiPeriod(owner, team, goal.id, input), pair[0]);
        const fresh = await createKpiGoal(owner, team, create());
        const attempts = await Promise.allSettled([
          createKpiPeriod(owner, team, fresh.goal.id, periodInput(fresh.goal)),
          createKpiPeriod(owner, team, fresh.goal.id, periodInput(fresh.goal)),
        ]);
        assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
        assert.equal(
          attempts.filter(
            (a) => a.status === "rejected" && a.reason.code === "kpi_goal_period_exists"
          ).length,
          1
        );
      });
      await t.test(
        "periods reject stale definitions, overlaps, measurement changes and unauthorized callers",
        async () => {
          const { goal } = await createKpiGoal(owner, team, create());
          for (const patch of [
            { scope: "personal" },
            { measurement: "number" },
            { unit: "USD" },
            { start_date: goal.end_date },
            { owner_id: stranger },
          ])
            await assert.rejects(
              () => createKpiPeriod(owner, team, goal.id, periodInput(goal, patch)),
              code("kpi_goal_invalid_input")
            );
          await assert.rejects(
            () =>
              createKpiPeriod(owner, team, goal.id, periodInput(goal, { expected_revision: 99 })),
            code("kpi_goal_revision_conflict")
          );
          await assert.rejects(
            () => createKpiPeriod(member, team, goal.id, periodInput(goal)),
            code("forbidden")
          );
          await assert.rejects(
            () => createKpiPeriod(stranger, team, goal.id, periodInput(goal)),
            code("forbidden")
          );
          const personal = await createKpiGoal(
            member,
            team,
            create({ scope: "personal", owner_id: member, contributor_ids: [] })
          );
          await assert.rejects(
            () => kpiGoalPeriods(owner, team, personal.goal.id),
            code("not_found")
          );
          const next = await createKpiPeriod(
            member,
            team,
            personal.goal.id,
            periodInput(personal.goal)
          );
          assert.equal(next.goal.scope, "personal");
          assert.equal(next.goal.owner_id, member);
          assert.deepEqual(next.goal.contributor_ids, []);
          const source = await createKpiGoal(
            member,
            team,
            create({ scope: "personal", owner_id: member, contributor_ids: [] })
          );
          const input = periodInput(source.goal);
          const post = () =>
            appFor(member).request(`/teams/${team}/kpi-goals/${source.goal.id}/periods`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            });
          const created = await post();
          assert.equal(created.status, 201);
          assert.deepEqual(await (await post()).json(), await created.json());
          const invalid = await appFor(member).request(
            `/teams/${team}/kpi-goals/${next.goal.id}/periods`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ...periodInput(next.goal), expected_revision: 0 }),
            }
          );
          assert.equal(invalid.status, 400);
          const response = await appFor(member).request(
            `/teams/${team}/kpi-goals/${personal.goal.id}/periods`
          );
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("cache-control"), "private, no-store");
        }
      );
      await t.test("database period links reject foreign workspaces and self-links", async () => {
        const { goal } = await createKpiGoal(owner, team, create());
        const foreign = await createKpiGoal(
          stranger,
          other,
          create({ scope: "personal", owner_id: stranger, contributor_ids: [] })
        );
        await assert.rejects(
          () =>
            db.$executeRaw`UPDATE kpi_goals SET previous_goal_id=${foreign.goal.id}::uuid WHERE id=${goal.id}::uuid`
        );
        await assert.rejects(
          () =>
            db.$executeRaw`UPDATE kpi_goals SET previous_goal_id=${goal.id}::uuid WHERE id=${goal.id}::uuid`
        );
        assert.equal(
          (await db.kpiGoal.findUniqueOrThrow({ where: { id: goal.id } })).previousGoalId,
          null
        );
      });
      await t.test("HTTP contract validates requests and uses structured conflicts", async () => {
        const app = appFor(owner);
        let response = await app.request(`/teams/${team}/kpi-goals`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...create(), target: 10 }),
        });
        assert.equal(response.status, 400);
        response = await app.request(`/teams/${team}/kpi-goals`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(create()),
        });
        assert.equal(response.status, 201);
        const { goal } = await response.json();
        response = await app.request(`/teams/${team}/kpi-goals/${goal.id}/check-ins`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(check(goal, "1", { expected_revision: 42 }).data),
        });
        assert.equal(response.status, 409);
        assert.equal((await response.json()).error, "kpi_goal_revision_conflict");
        response = await appFor(stranger).request(`/teams/${team}/kpi-goals`);
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
      });
      assert.equal(numericGoalProgress("0", "10", null), null);
    } finally {
      await db.team.deleteMany({ where: { id: { in: [team, other] } } });
      await db.user.deleteMany({ where: { id: { in: [owner, member, reader, stranger] } } });
      await db.$disconnect();
    }
  });
}
