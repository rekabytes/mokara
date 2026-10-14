import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
const OWNER = randomUUID(),
  MEMBER = randomUUID(),
  OTHER = randomUUID(),
  TEAM = randomUUID(),
  FOREIGN = randomUUID();
let state,
  caller,
  transactionTail = Promise.resolve(),
  onPut;
function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return expected.some((part) => matches(row, part));
    if (key === "AND") return expected.every((part) => matches(row, part));
    if (key === "NOT") return !matches(row, expected);
    if (key === "team") return row.teamId === TEAM && matches({ ownerId: OWNER }, expected);
    if (key === "folder")
      return matches(state.folders.find((f) => f.id === row.folderId) ?? {}, expected);
    const value = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      return Object.entries(expected).every(([op, operand]) =>
        op === "in"
          ? operand.includes(value)
          : op === "not"
            ? value !== operand
            : op === "lte"
              ? value <= operand
              : op === "lt"
                ? value < operand
                : op === "gte"
                  ? value >= operand
                  : op === "contains"
                    ? value.toLowerCase().includes(operand.toLowerCase())
                    : op === "startsWith"
                      ? value.startsWith(operand)
                      : op === "mode"
                        ? true
                        : false
      );
    }
    return value === expected;
  });
}
function table(name) {
  return {
    findUnique: async ({ where }) =>
      structuredClone(state[name].find((r) => matches(r, where)) ?? null),
    findFirst: async ({ where }) =>
      structuredClone(state[name].find((r) => matches(r, where)) ?? null),
    findMany: async ({ where = {}, skip = 0, take = Infinity } = {}) =>
      structuredClone(state[name].filter((r) => matches(r, where)).slice(skip, skip + take)),
    count: async ({ where = {} } = {}) => state[name].filter((r) => matches(r, where)).length,
    aggregate: async ({ where = {} } = {}) => ({
      _sum: {
        sizeBytes: state[name]
          .filter((r) => matches(r, where))
          .reduce((n, r) => n + r.sizeBytes, 0),
      },
    }),
    create: async ({ data }) => {
      if (state.failCreate && name === "files") throw Error("database write failed");
      const row = {
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        trashedAt: null,
        trashBatchId: null,
        attempts: 0,
        nextAttemptAt: new Date(),
        ...data,
      };
      state[name].push(row);
      return structuredClone(row);
    },
    createMany: async ({ data }) => {
      for (const row of data)
        await db[name === "jobs" ? "fileObjectDeletion" : "workspaceFile"].create({ data: row });
    },
    update: async ({ where, data }) => {
      const row = state[name].find((r) => matches(r, where));
      if (!row) throw Error("missing row");
      for (const [key, value] of Object.entries(data)) if (value !== undefined) row[key] = value;
      return structuredClone(row);
    },
    updateMany: async ({ where, data }) => {
      const rows = state[name].filter((r) => matches(r, where));
      for (const row of rows)
        for (const [key, value] of Object.entries(data))
          if (value !== undefined)
            row[key] =
              typeof value === "object" && value?.increment ? row[key] + value.increment : value;
      return { count: rows.length };
    },
    delete: async ({ where }) => {
      state[name] = state[name].filter((r) => !matches(r, where));
    },
    deleteMany: async ({ where }) => {
      const count = state[name].filter((r) => matches(r, where)).length;
      state[name] = state[name].filter((r) => !matches(r, where));
      return { count };
    },
  };
}
const db = {
  workspaceFile: table("files"),
  workspaceFolder: table("folders"),
  fileObjectDeletion: table("jobs"),
  teamMember: {
    findUnique: async ({ where }) =>
      where.teamId_userId.teamId === TEAM && state.member
        ? { role: where.teamId_userId.userId === OWNER ? "owner" : "member" }
        : null,
  },
  team: {
    findUnique: async ({ where }) =>
      where.id === TEAM
        ? { ownerId: OWNER, logoBytes: 10, owner: { plan: state.plan, planOverride: null } }
        : null,
    aggregate: async () => ({ _sum: { logoBytes: 10 } }),
  },
  user: { findUnique: async () => ({ username: "member", displayName: "Kai" }) },
  attachment: { aggregate: async () => ({ _sum: { sizeBytes: state.attachmentBytes } }) },
  $queryRaw: async () => [],
  $transaction: async (operation, options) => {
    assert.equal(options.isolationLevel, "ReadCommitted");
    const previous = transactionTail;
    let release;
    transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = structuredClone(state);
    try {
      return await operation(db);
    } catch (error) {
      state = snapshot;
      throw error;
    } finally {
      release();
    }
  },
};
mock.module("../src/db.ts", { namedExports: { prisma: db } });
mock.module("../src/env.ts", { namedExports: { isHosted: true, env: {} } });
mock.module("../src/lib/logger.ts", { namedExports: { log: { warn() {} } } });
mock.module("../src/lib/storage.ts", {
  namedExports: {
    storageReady: () => state.ready,
    putObject: async ({ key, body }) => {
      state.objects.set(key, body);
      if (onPut) await onPut();
      if (state.failPut) throw Error("storage offline");
    },
    deleteObjectStrict: async (key) => {
      if (state.failDelete) throw Error("storage offline");
      state.objects.delete(key);
    },
    getObjectStream: async (key, range) => {
      state.lastRange = range;
      const data = state.objects.get(key);
      if (!data) throw Error("missing");
      const bounds = range ? range.slice(6).split("-").map(Number) : [0, data.length - 1];
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(data.slice(bounds[0], bounds[1] + 1));
            controller.close();
          },
        }),
        contentRange: range
          ? state.ignoreRange
            ? undefined
            : `bytes ${bounds[0]}-${bounds[1]}/${data.length}`
          : undefined,
      };
    },
  },
});
const { fileRoutes } = await import("../src/routes/files.ts");
const { drainFileDeletions, expireFileTrash } = await import("../src/lib/file-cleanup.ts");
const { usedBytesOfOwner } = await import("../src/lib/quota.ts");
const {
  descendants,
  folderChain,
  byteRange,
  detectFileType,
  downloadDisposition,
  safeLibraryFilename,
} = await import("../src/lib/workspace-files.ts");
const app = new Hono();
app.use("*", async (c, next) => {
  c.set("userId", caller);
  await next();
});
app.route("/", fileRoutes);
app.onError((_e, c) => c.json({ error: "internal_error", message: "internal error" }, 500));
beforeEach(() => {
  state = {
    folders: [],
    files: [],
    jobs: [],
    objects: new Map(),
    member: true,
    plan: "free",
    attachmentBytes: 0,
    ready: true,
  };
  caller = MEMBER;
  onPut = null;
});
async function request(path = "/files", method = "GET", data, team = TEAM) {
  return app.request(`/teams/${team}${path}`, {
    method,
    ...(data
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }
      : {}),
  });
}
async function upload({
  id = randomUUID(),
  folder,
  bytes = Buffer.from("%PDF-1.7\nexample"),
  name = "Plan.pdf",
  type = "application/pdf",
} = {}) {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type }));
  const params = new URLSearchParams({ upload_id: id });
  if (folder) params.set("folder_id", folder);
  return app.request(`/teams/${TEAM}/files?${params}`, { method: "POST", body: form });
}
function folder(name = "Projects", parentId = null, createdById = MEMBER, extra = {}) {
  const row = {
    id: randomUUID(),
    teamId: TEAM,
    parentId,
    name,
    createdById,
    creatorName: "Kai",
    createdAt: new Date(),
    trashedAt: null,
    trashBatchId: null,
    ...extra,
  };
  state.folders.push(row);
  return row;
}
function file(folderId = null, uploadedById = MEMBER, extra = {}) {
  const row = {
    id: randomUUID(),
    teamId: TEAM,
    folderId,
    name: "Plan.pdf",
    uploadedById,
    uploaderName: "Kai",
    createdAt: new Date(),
    trashedAt: null,
    trashBatchId: null,
    sizeBytes: 10,
    storageKey: randomUUID(),
    uploadId: randomUUID(),
    contentHash: "a".repeat(64),
    contentType: "application/pdf",
    ...extra,
  };
  state.files.push(row);
  state.objects.set(row.storageKey, Buffer.from("%PDF-1.7xx"));
  return row;
}
test("all file routes check membership before exposing workspace contents", async () => {
  const id = randomUUID();
  for (const [path, method, body] of [
    ["/files", "GET"],
    ["/files?upload_id=" + id, "POST"],
    ["/files/" + id, "PATCH", { name: "new" }],
    ["/files/" + id + "/preview", "GET"],
    ["/folders", "POST", { name: "New" }],
  ]) {
    const result = await request(path, method, body, FOREIGN);
    assert.equal(result.status, 403);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
  }
  assert.equal((await request("/folders", "POST", { name: "../bad" })).status, 400);
});
test("uploads reserve owner storage, validate bytes, and retry idempotently after a lost response", async () => {
  const id = randomUUID();
  const first = await upload({ id });
  assert.equal(first.status, 201);
  const row = (await first.json()).file;
  assert.equal(state.jobs.length, 0);
  assert.equal(state.files.length, 1);
  const second = await upload({ id });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).file.id, row.id);
  assert.equal(state.files.length, 1);
  assert.equal((await upload({ id, bytes: Buffer.from("%PDF-1.7 different") })).status, 409);
  assert.equal((await upload({ bytes: Buffer.from("<html>bad</html>") })).status, 400);
  assert.equal((await upload({ type: "image/png" })).status, 400);
  assert.equal(await usedBytesOfOwner(OWNER), state.files[0].sizeBytes + 10);
});
test("an in-flight reservation blocks duplicates and counts toward the shared owner quota", async () => {
  const id = randomUUID();
  onPut = async () => {
    assert.equal(state.jobs.length, 1);
    assert.equal((await upload({ id })).status, 409);
    state.attachmentBytes = 1024 ** 3 - 10;
  };
  const result = await upload({ id });
  assert.equal(result.status, 409);
  assert.equal((await result.json()).error, "quota_exceeded");
  assert.equal(state.files.length, 0);
  assert.equal(state.jobs.length, 1);
  await drainFileDeletions();
  assert.equal(state.jobs.length, 0);
  assert.equal(state.objects.size, 0);
});
test("membership revoked during upload cannot commit; cleanup retries failed object deletion", async () => {
  onPut = () => {
    state.member = false;
  };
  assert.equal((await upload()).status, 403);
  assert.equal(state.files.length, 0);
  assert.equal(state.jobs.length, 1);
  state.failDelete = true;
  await drainFileDeletions();
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].attempts, 1);
  state.failDelete = false;
  state.jobs[0].nextAttemptAt = new Date(0);
  await drainFileDeletions();
  assert.equal(state.jobs.length, 0);
  assert.equal(state.objects.size, 0);
});
test("failed metadata writes retain a durable cleanup job and no live file", async () => {
  state.failCreate = true;
  assert.equal((await upload()).status, 503);
  assert.equal(state.files.length, 0);
  assert.equal(state.jobs.length, 1);
  await drainFileDeletions();
  assert.equal(state.jobs.length, 0);
  assert.equal(state.objects.size, 0);
});
test("folder creation and moves reject unavailable destinations and cycles", async () => {
  const parent = folder(),
    child = folder("Child", parent.id);
  assert.equal(
    (await request(`/folders/${parent.id}`, "PATCH", { parent_id: child.id })).status,
    409
  );
  assert.equal(
    (await request("/folders", "POST", { name: "Valid", parent_id: randomUUID() })).status,
    409
  );
  assert.equal(
    (await request("/folders", "POST", { name: "Valid", parent_id: parent.id })).status,
    201
  );
  assert.equal((await request(`/folders/${parent.id}`, "PATCH", { name: "Renamed" })).status, 200);
  const foreign = folder("Other", null, OTHER);
  assert.equal((await request(`/folders/${foreign.id}`, "PATCH", { name: "No" })).status, 403);
});
test("members cannot trash or restore folders containing other members or deleted uploaders", async () => {
  const parent = folder();
  file(parent.id, null);
  assert.equal((await request(`/folders/${parent.id}/trash`, "POST")).status, 403);
  caller = OWNER;
  assert.equal((await request(`/folders/${parent.id}/trash`, "POST")).status, 200);
  caller = MEMBER;
  assert.equal((await request(`/folders/${parent.id}/restore`, "POST")).status, 403);
});
test("folder restoration restores its own batch and leaves independently trashed contents alone", async () => {
  const parent = folder(),
    child = folder("Child", parent.id),
    active = file(child.id),
    prior = file(child.id, MEMBER, { trashedAt: new Date(), trashBatchId: randomUUID() });
  assert.equal((await request(`/folders/${parent.id}/trash`, "POST")).status, 200);
  assert.equal(state.files.find((f) => f.id === active.id).trashedAt instanceof Date, true);
  assert.equal((await request(`/folders/${parent.id}/restore`, "POST")).status, 200);
  assert.equal(state.files.find((f) => f.id === active.id).trashedAt, null);
  assert.equal(state.files.find((f) => f.id === prior.id).trashedAt instanceof Date, true);
});
test("restoring an item whose parent is in Trash moves it to the root", async () => {
  const parent = folder(),
    child = folder("Child", parent.id);
  const f = file(child.id);
  await request(`/folders/${parent.id}/trash`, "POST");
  assert.equal((await request(`/files/${f.id}/restore`, "POST")).status, 200);
  assert.equal(state.files[0].folderId, null);
  assert.equal((await request(`/folders/${child.id}/restore`, "POST")).status, 200);
  assert.equal(state.folders.find((row) => row.id === child.id).parentId, null);
});
test("trash charges storage; only owners may permanently delete; bytes release after object cleanup", async () => {
  const row = file();
  const before = await usedBytesOfOwner(OWNER);
  await request(`/files/${row.id}/trash`, "POST");
  assert.equal(await usedBytesOfOwner(OWNER), before);
  assert.equal((await request(`/files/${row.id}`, "DELETE")).status, 403);
  caller = OWNER;
  assert.equal((await request(`/files/${row.id}`, "DELETE")).status, 200);
  assert.equal(state.files.length, 0);
  assert.equal(state.jobs.length, 1);
  assert.equal(await usedBytesOfOwner(OWNER), before);
  await drainFileDeletions();
  assert.equal(await usedBytesOfOwner(OWNER), 10);
});
test("30-day expiry queues object deletion, while restored and recent items survive", async () => {
  const old = new Date(Date.now() - 31 * 86400_000),
    batch = randomUUID();
  const parent = folder("Old", null, MEMBER, { trashedAt: old, trashBatchId: batch });
  const row = file(parent.id, MEMBER, { trashedAt: old, trashBatchId: batch });
  file(null);
  file(null, MEMBER, { trashedAt: new Date(), trashBatchId: randomUUID() });
  assert.equal((await request(`/folders/${parent.id}/restore`, "POST")).status, 409);
  await expireFileTrash();
  assert.equal(state.folders.length, 0);
  assert.equal(state.files.length, 2);
  assert.equal(state.jobs[0].storageKey, row.storageKey);
});
test("private downloads support exact ranges and reject ignored or invalid ranges", async () => {
  const row = file();
  let result = await app.request(`/teams/${TEAM}/files/${row.id}/preview`, {
    headers: { Range: "bytes=2-4" },
  });
  assert.equal(result.status, 206);
  assert.equal(result.headers.get("content-range"), "bytes 2-4/10");
  assert.equal(result.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal((await result.arrayBuffer()).byteLength, 3);
  state.ignoreRange = true;
  result = await app.request(`/teams/${TEAM}/files/${row.id}/download`, {
    headers: { Range: "bytes=2-4" },
  });
  assert.equal(result.status, 503);
  result = await app.request(`/teams/${TEAM}/files/${row.id}/download`, {
    headers: { Range: "bytes=50-" },
  });
  assert.equal(result.status, 416);
  caller = OTHER;
  await request(`/files/${row.id}/trash`, "POST");
  assert.equal(state.files[0].trashedAt, null);
  caller = OWNER;
  await request(`/files/${row.id}/trash`, "POST");
  assert.equal((await request(`/files/${row.id}/preview`)).status, 404);
});
test("listing composes workspace search and type filters without exposing storage internals", async () => {
  file(null, MEMBER, { name: "Budget.pdf" });
  file(null, OTHER, { name: "Logo.png", contentType: "image/png" });
  const result = await request("/files?q=budget&type=pdf");
  const body = await result.json();
  assert.equal(body.total, 1);
  assert.equal(body.files[0].name, "Budget.pdf");
  assert.equal(body.files[0].storage_key, undefined);
  assert.equal(body.files[0].content_hash, undefined);
  assert.equal(body.usage.account_used_bytes, 30);
  assert.equal(body.usage.workspace_used_bytes, 30);
});
test("tree/range/signature helpers reject malformed input and sanitize download filenames", () => {
  const a = folder(),
    b = folder("Nested", a.id);
  assert.deepEqual([...descendants(state.folders, a.id)], [a.id, b.id]);
  a.parentId = b.id;
  assert.equal(folderChain(state.folders, b.id), null);
  for (const range of [
    "bytes=",
    "bytes=0-1,4-5",
    "bytes=-0",
    "bytes=20-",
    "bytes=5-2",
    "bytes=99999999999999999999-",
  ])
    assert.equal(byteRange(range, 10), "invalid");
  assert.deepEqual(byteRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(byteRange("bytes=5-99", 10), { start: 5, end: 9 });
  assert.equal(detectFileType(Buffer.from("<svg></svg>")), null);
  assert.equal(safeLibraryFilename("../unsafe\\folder/clean\u0000.pdf"), "clean.pdf");
  assert.equal(downloadDisposition('x"\r\ny.pdf').includes("\r"), false);
});

test("folder depth and count limits are enforced before writes", async () => {
  let parent = null;
  for (let i = 0; i < 20; i++) parent = folder(`Level ${i}`, parent?.id ?? null);
  assert.equal(
    (await request("/folders", "POST", { name: "Too deep", parent_id: parent.id })).status,
    409
  );
  state.folders = [];
  for (let i = 0; i < 1000; i++) folder(`Folder ${i}`);
  assert.equal((await request("/folders", "POST", { name: "Too many" })).status, 409);
});
test("expired crash reservations are charged until cleanup; active leases cannot be reclaimed", async () => {
  const expired = {
    id: randomUUID(),
    ownerId: OWNER,
    teamId: TEAM,
    storageKey: "expired",
    sizeBytes: 30,
    attempts: 0,
    nextAttemptAt: new Date(0),
  };
  const active = {
    ...expired,
    id: randomUUID(),
    storageKey: "active",
    nextAttemptAt: new Date(Date.now() + 60000),
  };
  state.jobs.push(expired, active);
  state.objects.set("expired", Buffer.from("file"));
  state.objects.set("active", Buffer.from("file"));
  assert.equal(await usedBytesOfOwner(OWNER), 70);
  await drainFileDeletions();
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].storageKey, "active");
  assert.equal(await usedBytesOfOwner(OWNER), 40);
});

test("mDrive images larger than 3 MB retain the package per-file allowance", async () => {
  const bytes = Buffer.alloc(3 * 1024 ** 2 + 1);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  const result = await upload({ bytes, name: "Large.png", type: "image/png" });
  assert.equal(result.status, 201);
  assert.equal((await result.json()).file.size_bytes, bytes.length);
});

test("MCP in-process mDrive uploads execute the actual file route and membership/quota rules", async () => {
  const { domainJson } = await import("../src/mcp/internal-api.ts");
  const principal = {
    userId: MEMBER,
    connectionId: randomUUID(),
    workspaceIds: [TEAM],
    scopes: ["mokara:read", "mokara:drive:upload"],
  };
  const form = new FormData();
  form.set("file", new File(["%PDF-1.7 sample"], "Agent.pdf", { type: "application/pdf" }));
  const result = await domainJson(
    principal,
    `/teams/${TEAM}/files?upload_id=${randomUUID()}`,
    "POST",
    form
  );
  assert.equal(result.file.name, "Agent.pdf");
  assert.equal(state.files[0].uploadedById, MEMBER);
  assert.equal(state.jobs.length, 0);
  state.member = false;
  await assert.rejects(
    domainJson(principal, `/teams/${TEAM}/folders`, "POST", { name: "No access" }),
    (e) => e.code === "forbidden"
  );
});
