import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../lib/api.ts";
let reply;
const requests = [];
const current = () => requests.at(-1);
class Xhr {
  upload = {};
  open(method, url) {
    this.method = method;
    this.url = url;
    requests.push(this);
  }
  send(form) {
    this.form = form;
    if (reply) reply(this);
  }
  abort() {
    this.onabort?.();
    this.onloadend?.();
  }
  finish(status, body) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
    this.onloadend?.();
  }
}
globalThis.XMLHttpRequest = Xhr;
const file = new File(["%PDF-1.7"], "Plan.pdf", { type: "application/pdf" });
const row = {
  id: "f",
  folder_id: "folder",
  name: "Plan.pdf",
  uploader_name: "Kai",
  size_bytes: 8,
  content_type: "application/pdf",
  created_at: "2026-10-14T00:00:00Z",
  trashed_at: null,
  can_manage: true,
};
test("workspace upload retries retain destination/identifier, report progress, and validate success", async () => {
  let progress = 0;
  reply = (xhr) => {
    xhr.upload.onprogress({ lengthComputable: true, loaded: 4, total: 8 });
    xhr.finish(503, { error: "storage_unavailable", message: "Safe failure" });
  };
  await assert.rejects(
    api.uploadWorkspaceFile("workspace", "folder", "stable-id", file, (fraction) => {
      progress = fraction;
    }),
    (e) => e.error === "storage_unavailable" && e.status === 503
  );
  assert.equal(progress, 0.5);
  const path = current().url;
  reply = (xhr) => xhr.finish(200, { file: row });
  assert.deepEqual(await api.uploadWorkspaceFile("workspace", "folder", "stable-id", file), {
    file: row,
  });
  assert.equal(current().url, path);
  assert.equal(current().url, "/api/teams/workspace/files?upload_id=stable-id&folder_id=folder");
  assert.equal(current().withCredentials, true);
  reply = (xhr) => xhr.finish(201, { file: { ...row, size_bytes: "8" } });
  await assert.rejects(
    api.uploadWorkspaceFile("workspace", null, "id", file),
    (e) => e.error === "invalid_response"
  );
});
test("workspace switches abort pending uploads and already-aborted requests never send a body", async () => {
  reply = null;
  const controller = new AbortController();
  const pending = api.uploadWorkspaceFile(
    "workspace",
    null,
    "id",
    file,
    undefined,
    controller.signal
  );
  controller.abort();
  await assert.rejects(pending, (e) => e.name === "AbortError");
  await assert.rejects(
    api.uploadWorkspaceFile("workspace", null, "id", file, undefined, controller.signal),
    (e) => e.name === "AbortError"
  );
  assert.equal(current().form, undefined);
});
