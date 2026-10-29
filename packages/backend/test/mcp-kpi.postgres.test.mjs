import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";

const url = process.env.KPI_GOALS_TEST_DATABASE_URL;
if (!url)
  test(
    "MCP business KPIs require an isolated KPI_GOALS_TEST_DATABASE_URL",
    { skip: true },
    () => {}
  );
else {
  if (!/(?:kpi|agent)_qa$/.test(new URL(url).pathname))
    throw Error("Use an isolated KPI QA database");
  process.env.DATABASE_URL = url;
  process.env.ENV = "development";
  let redisDown = false;
  // Only the rate-limit provider is stubbed. Auth credentials, grants, membership,
  // Hono routes, MCP transport, transactions and KPI history use the actual database.
  mock.module("../src/redis.ts", {
    namedExports: {
      getRedis: () => ({
        eval: async () => {
          if (redisDown) throw Error("private rate-limit address");
          return [1, 60];
        },
      }),
    },
  });
  const { prisma: db } = await import("../src/db.ts");
  const { mcpRoutes } = await import("../src/mcp/routes.ts");
  const { newCredential } = await import("../src/mcp/access.ts");
  const { MCP_SCOPES } = await import("../src/mcp/permissions.ts");
  const { createKpiGoal, mutateKpiGoal, createKpiPeriod } = await import("../src/lib/kpi-goals.ts");
  const app = new Hono().route("/mcp", mcpRoutes);
  const owner = randomUUID(),
    member = randomUUID(),
    reader = randomUUID(),
    workspace = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const before = (days) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
  const draft = (patch = {}) => ({
    request_id: randomUUID(),
    name: "Sales",
    scope: "team",
    measurement: "money",
    unit: "MYR",
    baseline: "0",
    target: "20000",
    start_date: before(30),
    end_date: today,
    owner_id: owner,
    contributor_ids: [member],
    ...patch,
  });
  async function connect(userId, scopes, workspaceIds = [workspace]) {
    const credential = newCredential();
    const row = await db.mcpConnection.create({
      data: {
        userId,
        name: "KPI QA",
        tokenHash: credential.tokenHash,
        workspaceIds,
        scopes,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return { token: credential.token, id: row.id };
  }
  async function rpc(connection, method, params = {}) {
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.token}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function call(connection, name, args) {
    const response = await rpc(connection, "tools/call", { name, arguments: args });
    assert.equal(response.status, 200);
    return response.body.result;
  }
  const failure = (result) => {
    assert.equal(result.isError, true);
    return JSON.parse(result.content[0].text);
  };
  test("MCP business KPIs use real permissions and transactional check-ins", async (t) => {
    await db.user.createMany({
      data: [owner, member, reader].map((id) => ({ id, username: `mcp_kpi_${id}` })),
    });
    await db.team.create({
      data: {
        id: workspace,
        name: "KPI MCP QA",
        slug: `kpi-${workspace}`,
        ownerId: owner,
        kind: "team",
        members: {
          create: [{ userId: owner, role: "owner" }, { userId: member }, { userId: reader }],
        },
      },
    });
    try {
      const read = await connect(member, ["mokara:read"]),
        write = await connect(member, ["mokara:read", "mokara:write"]),
        visitor = await connect(reader, ["mokara:read", "mokara:write"]),
        excluded = await connect(member, ["mokara:read", "mokara:write"], [randomUUID()]);
      const shared = await createKpiGoal(owner, workspace, draft());
      const personal = await createKpiGoal(
        owner,
        workspace,
        draft({ scope: "personal", contributor_ids: [] })
      );
      const args = { workspace_id: workspace, kpi_goal_id: shared.goal.id };
      const input = (goal, patch = {}) => ({
        ...args,
        kpi_goal_id: goal.id,
        request_id: randomUUID(),
        expected_revision: goal.revision,
        value: "5000",
        observed_on: today,
        source: "User supplied the sales total",
        note: "Monthly review",
        ...patch,
      });

      await t.test(
        "discovery preserves read-only grants and lists the full 72-tool catalog",
        async () => {
          const tools = (await rpc(read, "tools/list")).body.result.tools;
          const names = tools.map((tool) => tool.name);
          for (const name of [
            "list_business_kpis",
            "get_business_kpi",
            "get_business_kpi_review",
            "list_business_kpi_history",
            "compare_business_kpi_periods",
          ])
            assert.ok(names.includes(name));
          assert.ok(!names.includes("record_business_kpi_check_in"));
          assert.ok(tools.every((tool) => tool.annotations.readOnlyHint));
          const all = await connect(owner, [...MCP_SCOPES]);
          const allTools = (await rpc(all, "tools/list")).body.result.tools;
          assert.equal(allTools.length, 72);
          assert.equal(
            allTools.find((tool) => tool.name === "record_business_kpi_check_in").annotations
              .readOnlyHint,
            false
          );
          assert.equal(
            allTools.find((tool) => tool.name === "record_business_kpi_check_in").annotations
              .destructiveHint,
            false
          );
          const checkIn = allTools.find((tool) => tool.name === "record_business_kpi_check_in");
          for (const field of ["source", "request_id", "expected_revision", "value", "observed_on"])
            assert.ok(checkIn.inputSchema.required.includes(field));
          assert.equal(checkIn.inputSchema.properties.value.type, "string");
          assert.match(checkIn.inputSchema.properties.value.description, /Not an increment/);
        }
      );
      await t.test(
        "reads enforce workspace allowlists, personal visibility and current membership",
        async () => {
          const list = await call(read, "list_business_kpis", {
            workspace_id: workspace,
            limit: 1,
          });
          assert.equal(list.structuredContent.goals.length, 1);
          assert.equal(list.structuredContent.members, undefined);
          assert.equal(
            failure(
              await call(read, "get_business_kpi", { ...args, kpi_goal_id: personal.goal.id })
            ).error,
            "not_found"
          );
          assert.equal(
            failure(await call(excluded, "get_business_kpi", args)).error,
            "mcp_workspace_forbidden"
          );
          assert.equal(
            (await call(read, "get_business_kpi", args)).structuredContent.goal.current_value,
            null
          );
          await db.teamMember.delete({
            where: { teamId_userId: { teamId: workspace, userId: member } },
          });
          assert.equal(
            failure(await call(read, "get_business_kpi", args)).error,
            "mcp_workspace_forbidden"
          );
          await db.teamMember.create({ data: { teamId: workspace, userId: member } });
          await db.kpiGoalContributor.create({
            data: { goalId: shared.goal.id, teamId: workspace, userId: member },
          });
        }
      );
      await t.test(
        "check-ins require both write scope and goal contribution permission",
        async () => {
          const denied = await rpc(read, "tools/call", {
            name: "record_business_kpi_check_in",
            arguments: input(shared.goal),
          });
          assert.ok(denied.body.error || denied.body.result?.isError);
          assert.equal(
            failure(await call(visitor, "record_business_kpi_check_in", input(shared.goal))).error,
            "forbidden"
          );
          assert.equal(await db.kpiGoalEntry.count({ where: { goalId: shared.goal.id } }), 1);
        }
      );
      let current;
      await t.test(
        "identical concurrent retries save one attributed check-in and preserve exact values",
        async () => {
          const request = input(shared.goal, {
            value: "5000.1234",
            source: "User-provided figure <script>data</script>",
          });
          const results = await Promise.all([
            call(write, "record_business_kpi_check_in", request),
            call(write, "record_business_kpi_check_in", request),
          ]);
          for (const result of results) assert.equal(result.isError, undefined);
          assert.deepEqual(results[0].structuredContent, results[1].structuredContent);
          current = results[0].structuredContent.goal;
          assert.equal(current.current_value, "5000.1234");
          assert.equal(current.progress, 25);
          assert.equal(results[0].structuredContent.request_id, request.request_id);
          assert.equal(
            results[0].structuredContent.entry.note,
            "Source: User-provided figure <script>data</script>\nMonthly review"
          );
          assert.equal(await db.kpiGoalEntry.count({ where: { goalId: shared.goal.id } }), 2);
          assert.equal(
            failure(
              await call(write, "record_business_kpi_check_in", { ...request, value: "6000" })
            ).error,
            "kpi_goal_idempotency_conflict"
          );
          assert.equal(
            failure(await call(write, "record_business_kpi_check_in", input(shared.goal))).error,
            "kpi_goal_revision_conflict"
          );
          await db.teamMember.delete({
            where: { teamId_userId: { teamId: workspace, userId: member } },
          });
          assert.equal(
            failure(await call(write, "record_business_kpi_check_in", request)).error,
            "mcp_workspace_forbidden"
          );
          await db.teamMember.create({ data: { teamId: workspace, userId: member } });
          await db.kpiGoalContributor.create({
            data: { goalId: shared.goal.id, teamId: workspace, userId: member },
          });
        }
      );
      await t.test(
        "history pagination and review reflect the actual saved observation",
        async () => {
          const first = (await call(read, "list_business_kpi_history", { ...args, limit: 1 }))
            .structuredContent;
          assert.equal(first.entries.length, 1);
          assert.ok(first.next_cursor);
          const second = (
            await call(read, "list_business_kpi_history", {
              ...args,
              limit: 1,
              cursor: first.next_cursor,
            })
          ).structuredContent;
          assert.equal(second.entries.length, 1);
          assert.equal(second.entries[0].kind, "created");
          const review = (await call(read, "get_business_kpi_review", args)).structuredContent;
          assert.equal(review.observations.length, 1);
          assert.equal(review.observations[0].value, "5000.1234");
          assert.equal(review.as_of, today);
        }
      );
      await t.test(
        "period comparison reads linked targets without creating or modifying a period",
        async () => {
          const start = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10),
            end = new Date(Date.parse(today) + 31 * 86400000).toISOString().slice(0, 10);
          const next = await createKpiPeriod(
            owner,
            workspace,
            current.id,
            draft({
              expected_revision: current.revision,
              start_date: start,
              end_date: end,
              target: "25000",
            })
          );
          const compared = (
            await call(read, "compare_business_kpi_periods", { ...args, kpi_goal_id: next.goal.id })
          ).structuredContent;
          assert.equal(compared.previous.current_value, "5000.1234");
          assert.equal(compared.previous.target, "20000");
          assert.equal(compared.goal.current_value, null);
          assert.equal(compared.goal.target, "25000");
          assert.equal(compared.next, null);
          const first = (
            await call(read, "list_business_kpis", { workspace_id: workspace, limit: 1 })
          ).structuredContent;
          assert.equal(first.goals.length, 1);
          assert.ok(first.next_cursor);
          const second = (
            await call(read, "list_business_kpis", {
              workspace_id: workspace,
              limit: 1,
              cursor: first.next_cursor,
            })
          ).structuredContent;
          assert.equal(second.goals.length, 1);
          assert.notEqual(first.goals[0].id, second.goals[0].id);
        }
      );
      await t.test(
        "missing source, numeric values and invalid page sizes cannot mutate data",
        async () => {
          const count = await db.kpiGoalEntry.count({ where: { goalId: current.id } });
          for (const patch of [
            { source: "" },
            { source: undefined },
            { value: 5000 },
            { observed_on: "not-a-date" },
            { extra: true },
          ]) {
            const response = await rpc(write, "tools/call", {
              name: "record_business_kpi_check_in",
              arguments: input(current, patch),
            });
            assert.ok(response.body.error || response.body.result?.isError);
          }
          const response = await rpc(read, "tools/call", {
            name: "list_business_kpis",
            arguments: { workspace_id: workspace, limit: 21 },
          });
          assert.ok(response.body.error || response.body.result?.isError);
          assert.equal(await db.kpiGoalEntry.count({ where: { goalId: current.id } }), count);
        }
      );
      await t.test("archived goals and revoked credentials refuse new writes", async () => {
        const archived = await mutateKpiGoal(owner, workspace, current.id, {
          kind: "details_changed",
          data: {
            request_id: randomUUID(),
            expected_revision: current.revision,
            name: current.name,
            owner_id: owner,
            contributor_ids: [member],
            archived: true,
          },
        });
        assert.equal(
          failure(await call(write, "record_business_kpi_check_in", input(archived.goal))).error,
          "forbidden"
        );
        await db.mcpConnection.update({ where: { id: write.id }, data: { revokedAt: new Date() } });
        assert.equal((await rpc(write, "tools/list")).status, 401);
        redisDown = true;
        const response = await rpc(read, "tools/list");
        assert.equal(response.status, 503);
        assert.ok(!JSON.stringify(response.body).includes("private rate-limit address"));
        redisDown = false;
      });
    } finally {
      redisDown = false;
      await db.team.deleteMany({ where: { id: workspace } });
      await db.user.deleteMany({ where: { id: { in: [owner, member, reader] } } });
      await db.$disconnect();
    }
  });
}
