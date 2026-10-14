import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const workspace = randomUUID(),
  userId = randomUUID(),
  connectionId = randomUUID(),
  fileId = randomUUID();
let member, trashed, bytes, mime, calls, operations;
const db = {
  teamMember: { findUnique: async () => (member ? { role: "member" } : null) },
  workspaceFile: {
    findFirst: async ({ where }) =>
      where.teamId === workspace && where.id === fileId && !trashed
        ? {
            id: fileId,
            teamId: workspace,
            folderId: null,
            name: "File",
            uploadedById: userId,
            uploaderName: "Kai",
            sizeBytes: bytes.length,
            contentType: mime,
            createdAt: new Date(),
            trashedAt: null,
            storageKey: "secret-key",
          }
        : null,
  },
  mcpOperation: {
    findUnique: async ({ where }) => operations.get(where.connectionId_requestId.requestId) ?? null,
    create: async ({ data }) => {
      const row = { ...data, id: randomUUID(), status: "pending" };
      operations.set(data.requestId, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = [...operations.values()].find((r) => r.id === where.id);
      Object.assign(row, data);
    },
  },
};
mock.module("../src/db.ts", { namedExports: { prisma: db } });
mock.module("../src/env.ts", { namedExports: { env: { AUTH_SECRET: "test" } } });
mock.module("../src/redis.ts", {
  namedExports: { getRedis: () => ({ eval: async () => [1, 60] }) },
});
mock.module("../src/lib/storage.ts", {
  namedExports: {
    getObjectChunk: async (_key, offset, length) => bytes.subarray(offset, offset + length),
  },
});
mock.module("../src/mcp/internal-api.ts", {
  namedExports: {
    domainJson: async (_principal, path, method, body) => {
      calls.push({ path, method, body });
      if (method === "POST") return { file: { id: fileId }, completed: true };
      return { folders: [], files: [{ id: fileId }], total: 1, page: 1, page_size: 40, usage: {} };
    },
  },
});
const { registerDriveTools } = await import("../src/mcp/drive-tools.ts");
const { readPdfText } = await import("../src/mcp/drive-pdf.ts");
const { validScopes } = await import("../src/mcp/permissions.ts");
const principal = {
  workspaceIds: [workspace],
  userId,
  connectionId,
  scopes: ["mokara:read", "mokara:drive:read", "mokara:drive:upload"],
};
const tools = new Map();
registerDriveTools(
  (name, description, schema, action, options) =>
    tools.set(name, { description, schema, action, options }),
  principal
);
const call = (name, input) => {
  const tool = tools.get(name);
  return tool.action(tool.schema.parse({ workspace_id: workspace, ...input }));
};
beforeEach(() => {
  member = true;
  trashed = false;
  bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  mime = "image/png";
  calls = [];
  operations = new Map();
  principal.scopes = ["mokara:read", "mokara:drive:read", "mokara:drive:upload"];
});
test("drive scopes remain separate and existing task grants do not grant drive access", async () => {
  assert.equal(validScopes(principal.scopes), true);
  assert.equal(validScopes(["mokara:drive:read"]), false);
  principal.scopes = ["mokara:read", "mokara:write"];
  await assert.rejects(
    call("read_drive_file", { file_id: fileId }),
    (e) => e.code === "mcp_scope_forbidden"
  );
  await assert.rejects(
    call("upload_drive_file", {
      request_id: randomUUID(),
      filename: "x.png",
      content_type: mime,
      data_base64: bytes.toString("base64"),
    }),
    (e) => e.code === "mcp_scope_forbidden"
  );
});
test("reads enforce current membership, workspace scope and exclude Trash", async () => {
  await assert.rejects(
    call("get_drive_file", { file_id: fileId, workspace_id: randomUUID() }),
    (e) => e.code === "mcp_workspace_forbidden"
  );
  member = false;
  await assert.rejects(
    call("read_drive_file", { file_id: fileId }),
    (e) => e.code === "mcp_workspace_forbidden"
  );
  member = true;
  trashed = true;
  await assert.rejects(call("get_drive_file", { file_id: fileId }), (e) => e.code === "not_found");
});
test("images return native-ready content; metadata hides bucket keys; chunks reconstruct exact bytes", async () => {
  const result = await call("read_drive_file", { file_id: fileId });
  assert.equal(result.image.data, bytes.toString("base64"));
  assert.equal(result.file.storage_key, undefined);
  const first = await call("read_drive_file", { file_id: fileId, mode: "bytes", length: 3 });
  const second = await call("read_drive_file", {
    file_id: fileId,
    mode: "bytes",
    offset: first.next_offset,
  });
  assert.deepEqual(
    Buffer.concat([Buffer.from(first.data, "base64"), Buffer.from(second.data, "base64")]),
    bytes
  );
  assert.equal(second.next_offset, null);
  bytes = Buffer.alloc(1048577);
  await assert.rejects(
    call("read_drive_file", { file_id: fileId }),
    (e) => e.code === "mcp_file_too_large"
  );
  await assert.rejects(
    call("read_drive_file", { file_id: fileId, mode: "bytes", offset: bytes.length }),
    (e) => e.code === "invalid_input"
  );
});
test("upload/folder writes reuse durable request IDs and domain API quotas/validation", async () => {
  const input = {
    request_id: randomUUID(),
    filename: "x.png",
    content_type: mime,
    data_base64: bytes.toString("base64"),
    folder_id: randomUUID(),
  };
  await call("upload_drive_file", input);
  await call("upload_drive_file", input);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].path.includes(`upload_id=${input.request_id}`));
  assert.ok(calls[0].path.includes(`folder_id=${input.folder_id}`));
  assert.equal(calls[0].body.get("file").type, mime);
  await assert.rejects(
    call("upload_drive_file", { ...input, filename: "other.png" }),
    (e) => e.code === "mcp_request_conflict"
  );
  await call("create_drive_folder", { request_id: randomUUID(), name: "Docs" });
  assert.equal(calls[1].body.parent_id, null);
});
test("directory tools send constrained filters and name searches through mDrive routes", async () => {
  const result = await call("search_drive_items", { query: "Proposal", file_type: "pdf" });
  assert.equal(result.files.length, 1);
  assert.ok(calls[0].path.includes("q=Proposal"));
  assert.ok(calls[0].path.includes("type=pdf"));
  assert.ok(calls[0].path.includes("view=files"));
});
function pdf(text) {
  const stream = `BT /F1 12 Tf 40 200 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(value));
    value += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(value);
}
test("real isolated PDF parser extracts page text and rejects malformed/out-of-range documents", async () => {
  const result = await readPdfText(pdf("Mokara proposal"), 1, 1, 0);
  assert.equal(result.total_pages, 1);
  assert.match(result.pages[0].text, /Mokara proposal/);
  assert.equal(result.next_page, null);
  const offset = await readPdfText(pdf("Mokara proposal"), 1, 1, 7);
  assert.match(offset.pages[0].text, /proposal/);
  const scan = await readPdfText(pdf(""), 1, 1, 0);
  assert.equal(scan.pages[0].no_extractable_text, true);
  await assert.rejects(readPdfText(pdf("x"), 2, 1, 0), (e) => e.code === "mcp_pdf_unreadable");
  await assert.rejects(
    readPdfText(Buffer.from("%PDF-invalid"), 1, 1, 0),
    (e) => e.code === "mcp_pdf_unreadable"
  );
});
