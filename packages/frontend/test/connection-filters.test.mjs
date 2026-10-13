import { test } from "node:test";
import assert from "node:assert/strict";
import filters from "../app/(app)/settings/connection-filters.ts";
const { repositoryStatus, filterRepositories, filterAgentConnections } = filters;
const repository = (id, enabled, available = true) => ({
  id,
  full_name: `studio/${id}`,
  installation_account: "studio",
  enabled,
  available,
  private: true,
});
test("repository views separate active, inactive and unavailable, even when unavailable is enabled", () => {
  const rows = [
    repository("z-active", true),
    repository("a-inactive", false),
    repository("b-unavailable", true, false),
  ];
  assert.equal(repositoryStatus(rows[2]), "unavailable");
  assert.deepEqual(
    filterRepositories(rows, "active", "").map((row) => row.id),
    ["z-active"]
  );
  assert.deepEqual(
    filterRepositories(rows, "inactive", "").map((row) => row.id),
    ["a-inactive"]
  );
  assert.deepEqual(
    filterRepositories(rows, "unavailable", "").map((row) => row.id),
    ["b-unavailable"]
  );
  assert.deepEqual(
    filterRepositories(rows, "all", "").map((row) => row.id),
    ["z-active", "a-inactive", "b-unavailable"]
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["z-active", "a-inactive", "b-unavailable"]
  );
});
test("repository search composes with the selected view and does not change activation", () => {
  const rows = [repository("app", true), repository("api", false)];
  assert.equal(filterRepositories(rows, "active", " API ").length, 0);
  assert.equal(filterRepositories(rows, "all", " API ")[0].id, "api");
  assert.equal(filterRepositories(rows, "all", "STUDIO").length, 2);
  assert.equal(rows[1].enabled, false);
});
test("AI permission filters combine with agent and workspace search", () => {
  const rows = [
    { name: "Coding agent", access: "write", workspace_ids: ["one"] },
    { name: "Reader", access: "read", workspace_ids: ["two"] },
  ];
  const names = new Map([
    ["one", "Product"],
    ["two", "Personal"],
  ]);
  assert.equal(filterAgentConnections(rows, "write", "PRODUCT", names).length, 1);
  assert.equal(filterAgentConnections(rows, "read", "product", names).length, 0);
  assert.equal(filterAgentConnections(rows, "all", "reader", names)[0].name, "Reader");
  assert.equal(filterAgentConnections(rows, "all", "", names).length, 2);
});
