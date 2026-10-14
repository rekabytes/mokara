import { test } from "node:test";
import assert from "node:assert/strict";
import { breadcrumbs, moveDestinations, visibleFolders } from "../app/(app)/files/file-model.ts";
const a = {
  id: "a",
  name: "Projects",
  parent_id: null,
  trashed_at: null,
  created_at: "2026-01-01",
};
const b = { ...a, id: "b", parent_id: "a", name: "Design" };
const c = { ...a, id: "c", name: "Archived", trashed_at: "2026-01-02" };
const d = { ...c, id: "d", parent_id: "c", name: "Nested trash" };
test("folder views show active children, compose search/type, and surface only trash roots", () => {
  const folders = [a, b, c, d];
  assert.deepEqual(
    visibleFolders(folders, { view: "files" }).map((f) => f.id),
    ["a"]
  );
  assert.deepEqual(
    visibleFolders(folders, { view: "files", folder_id: "a" }).map((f) => f.id),
    ["b"]
  );
  assert.deepEqual(
    visibleFolders(folders, { view: "files", q: "DESIGN" }).map((f) => f.id),
    ["b"]
  );
  assert.deepEqual(visibleFolders(folders, { view: "files", type: "pdf" }), []);
  assert.deepEqual(
    visibleFolders(folders, { view: "trash" }).map((f) => f.id),
    ["c"]
  );
  assert.deepEqual(
    visibleFolders(folders, { view: "trash", folder_id: "c" }).map((f) => f.id),
    ["d"]
  );
});
test("folder moves exclude self/descendants and trash while file moves retain all active destinations", () => {
  assert.deepEqual(moveDestinations([a, b, c, d], { kind: "folders", id: "a" }), []);
  assert.deepEqual(
    moveDestinations([a, b, c, d], { kind: "files", id: "file" }).map((f) => f.id),
    ["a", "b"]
  );
  assert.deepEqual(
    breadcrumbs([a, b], "b").map((f) => f.name),
    ["Projects", "Design"]
  );
  assert.equal(breadcrumbs([{ ...a, parent_id: "b" }, b], "b").length, 2);
});
