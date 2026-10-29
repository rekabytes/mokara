import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { AgentExecutionDetails } from "../app/(app)/tasks/AgentExecutionDetails.tsx";
import { AgentExecutionPanel } from "../app/(app)/tasks/AgentExecutionPanel.tsx";
import { api } from "../lib/api.ts";
import { agentDetailSchema } from "../lib/agent-execution.ts";
const id = "11111111-1111-4111-8111-111111111111";
const date = "2026-10-29T01:00:00.000Z";
const base = {
  task: {},
  ready: false,
  paused: false,
  revision: "1",
  execution: null,
  new_information: false,
  history: [],
  next_history_cursor: null,
};
const execution = {
  id,
  task_id: id,
  workspace_id: id,
  project_id: null,
  client_id: "research-service",
  client_name: "Research connection",
  state: "running",
  accepted_revision: "1",
  claimed_at: date,
  started_at: date,
  heartbeat_at: date,
  lease_expires_at: date,
  finished_at: null,
  progress: "Reading docs",
  progress_percent: 40,
  result: null,
  failure: null,
  task_deleted: false,
};
const render = (detail, blocked = false) =>
  renderToStaticMarkup(
    React.createElement(AgentExecutionDetails, {
      detail,
      blocked,
      onAction: () => {},
      onMore: () => {},
    })
  );
test("initial state explicitly separates authorization, synchronization and ordinary status", () => {
  const html = render(base);
  assert.match(html, /Not ready/);
  assert.match(html, /Ready for agent/);
  assert.match(html, /Pause synchronization/);
  assert.doesNotMatch(html, /Request cancellation|Recover and requeue/);
  const ready = render({ ...base, ready: true });
  assert.match(ready, /Withdraw readiness/);
  assert.doesNotMatch(ready, />Ready for agent<\/button>/);
});
test("running, cancellation and unknown outcomes present distinct accessible actions", () => {
  const running = render({ ...base, execution, new_information: true });
  assert.match(running, /Request cancellation/);
  assert.match(running, /aria-label="Execution progress"/);
  assert.match(running, /Last check-in/);
  assert.match(running, /task changed/);
  assert.doesNotMatch(running, />Ready for agent<\/button>/);
  const cancel = render({ ...base, execution: { ...execution, state: "cancel_requested" } });
  assert.match(cancel, /has not confirmed that it stopped/);
  assert.doesNotMatch(cancel, /Request cancellation<\/button>/);
  const unknown = render({ ...base, execution: { ...execution, state: "unknown" } });
  assert.match(unknown, /Recover and requeue/);
  assert.match(unknown, /Review external changes/);
  assert.doesNotMatch(unknown, /Request cancellation<\/button>/);
});
test("results, failures and history are escaped and uncertainty disables additional writes", () => {
  const html = render(
    {
      ...base,
      execution: { ...execution, state: "finished", result: "<script>private()</script>" },
      history: [{ ...execution, state: "failed", failure: "Source unavailable" }],
      next_history_cursor: "cursor",
    },
    true
  );
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Source unavailable/);
  assert.match(html, /Execution history/);
  assert.match(html, /Load more executions/);
  assert.match(html, /disabled=""/);
});
test("server render shows loading without starting browser requests", (t) => {
  const request = t.mock.method(api, "agentTask", async () => base);
  const html = renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: { replace: () => {} } },
      React.createElement(AgentExecutionPanel, {
        task: { id, team_id: id, updated_at: date },
        onChange: () => {},
      })
    )
  );
  assert.match(html, /Loading agent status/);
  assert.equal(request.mock.callCount(), 0);
});
test("saved readiness is re-read on reopen, transport errors reject and retry keeps request identity", async (t) => {
  let persisted = base;
  let failed = true;
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options?.method === "POST") {
      requests.push(JSON.parse(options.body));
      if (failed) throw Error("offline");
      persisted = { ...base, ready: true, revision: "2" };
      return Response.json({ task_id: id, revision: "2", ready: true, paused: false });
    }
    return Response.json(persisted);
  });
  const request = {
    workspace_id: id,
    task_id: id,
    request_id: crypto.randomUUID(),
    action: "readiness",
    expected_revision: "1",
    ready: true,
  };
  await assert.rejects(
    () => api.agentCommand(request),
    (e) => e.error === "network_error"
  );
  failed = false;
  await api.agentCommand(request);
  assert.deepEqual(requests[0], requests[1]);
  const reopened = await api.agentTask(id, id);
  assert.equal(reopened.ready, true);
  assert.equal(reopened.revision, "2");
  assert.equal(
    agentDetailSchema.safeParse({
      ...reopened,
      execution: { ...execution, state: "pretend-finished" },
    }).success,
    false
  );
});
