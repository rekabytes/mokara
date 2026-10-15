import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
const OWNER = randomUUID(),
  OTHER = randomUUID(),
  PERSONAL = randomUUID(),
  TEAM = randomUUID(),
  SECOND = randomUUID(),
  FOREIGN = randomUUID(),
  TASK = randomUUID(),
  SECOND_TASK = randomUUID(),
  COMMENT = randomUUID();
const GiB = 1024 ** 3;
let state;
const sum = (values) => values.reduce((a, b) => a + b, 0);
const prisma = {
  workspaceFile: {
    aggregate: async () => ({ _sum: { sizeBytes: 0 }, _count: { _all: 0 } }),
    groupBy: async () => [],
  },
  fileObjectDeletion: {
    aggregate: async () => ({ _sum: { sizeBytes: 0 } }),
    groupBy: async () => [],
  },
  team: {
    findUnique: async ({ where }) => {
      const t = state.teams.get(where.id);
      return t ? { ...t, owner: { ...state.users.get(t.ownerId) } } : null;
    },
    aggregate: async ({ where }) => {
      state.queries.push(where);
      return {
        _sum: {
          logoBytes: sum(
            [...state.teams.values()]
              .filter((t) => t.ownerId === where.ownerId)
              .map((t) => t.logoBytes ?? 0)
          ),
        },
      };
    },
    update: async ({ where, data }) => {
      if (state.failWrite) throw Error("database unavailable");
      Object.assign(state.teams.get(where.id), data);
      return state.teams.get(where.id);
    },
  },
  user: { findUnique: async ({ where }) => state.users.get(where.id) ?? null },
  teamMember: {
    findUnique: async ({ where }) =>
      !state.member
        ? null
        : {
            role:
              state.teams.get(where.teamId_userId.teamId)?.ownerId === where.teamId_userId.userId
                ? "owner"
                : "member",
          },
    count: async () => 2,
  },
  task: {
    findUnique: async ({ where }) => ({
      id: where.id,
      teamId: where.id === SECOND_TASK ? SECOND : TEAM,
    }),
  },
  comment: { findUnique: async () => ({ taskId: TASK }) },
  attachment: {
    aggregate: async ({ where }) => {
      state.queries.push(where);
      return {
        _sum: {
          sizeBytes: sum(
            state.files
              .filter((f) =>
                where.team
                  ? state.teams.get(f.teamId)?.ownerId === where.team.ownerId
                  : f.teamId === where.teamId
              )
              .map((f) => f.sizeBytes)
          ),
        },
      };
    },
    create: async ({ data }) => {
      if (state.failWrite) throw Error("database unavailable");
      const row = {
        ...data,
        createdAt: new Date(),
        uploader: { id: data.uploaderId, username: "member", displayName: null },
      };
      state.files.push(row);
      return row;
    },
    findUnique: async ({ where }) => state.files.find((f) => f.id === where.id) ?? null,
    delete: async ({ where }) => {
      state.files = state.files.filter((f) => f.id !== where.id);
    },
  },
  $transaction: async (operation, options) => {
    assert.equal(options.isolationLevel, "ReadCommitted");
    let release;
    const client = {
      ...prisma,
      $queryRaw: async (parts, owner) => {
        assert.match(parts.join("?"), /SELECT id FROM users.*FOR UPDATE/);
        const previous = state.locks.get(owner) ?? Promise.resolve();
        const lock = new Promise((r) => {
          release = r;
        });
        state.locks.set(
          owner,
          previous.then(() => lock)
        );
        await previous;
        state.ownerLocks.push(owner);
        return [{ id: owner }];
      },
    };
    try {
      return await operation(client);
    } finally {
      release?.();
    }
  },
};
mock.module("../src/db.ts", { namedExports: { prisma } });
mock.module("../src/env.ts", {
  namedExports: {
    isHosted: true,
    storageConfigured: true,
    billingConfigured: false,
    checkoutConfigured: false,
    env: { ENV: "development", AUTH_PUBLIC_URL: "" },
  },
});
mock.module("../src/lib/notifications.ts", { namedExports: { notify: async () => {} } });
mock.module("../src/lib/billing.ts", {
  namedExports: Object.fromEntries(
    [
      "createCheckoutSession",
      "createPortalSession",
      "ensureStripeCustomer",
      "handleStripeEvent",
      "stripeClient",
      "syncBillingForUser",
    ].map((name) => [name, async () => {}])
  ),
});
const actualStorage = await import("../src/lib/storage.ts");
mock.module("../src/lib/storage.ts", {
  namedExports: {
    ...actualStorage,
    putObject: async ({ key, body, contentType }) => {
      if (state.failPut) throw Error("storage unavailable");
      state.puts.push(key);
      state.objects.set(key, body);
      state.contentTypes.set(key, contentType);
      await state.onPut?.();
    },
    getObjectBytes: async (key) => ({
      body: state.objects.get(key) ?? new Uint8Array([1]),
      contentType: state.contentTypes.get(key) ?? "application/pdf",
    }),
    deleteObject: async (key) => {
      state.removed.push(key);
      state.objects.delete(key);
    },
  },
});
const { attachmentRoutes } = await import("../src/routes/attachments.ts");
const { teamRoutes } = await import("../src/routes/teams.ts");
const { billingRoutes } = await import("../src/routes/billing.ts");
const { usedBytesOfOwner, storageAccountForTeam, storageUploadDenial } =
  await import("../src/lib/quota.ts");
const { UNLIMITED } = await import("../src/lib/plans.ts");
const app = new Hono();
app.use("*", async (c, next) => {
  c.set("userId", state.actor);
  await next();
});
app.route("/", attachmentRoutes);
app.route("/teams", teamRoutes);
app.route("/", billingRoutes);
beforeEach(() => {
  state = {
    actor: OTHER,
    member: true,
    files: [],
    queries: [],
    ownerLocks: [],
    locks: new Map(),
    puts: [],
    removed: [],
    objects: new Map(),
    contentTypes: new Map(),
    users: new Map([
      [
        OWNER,
        {
          id: OWNER,
          plan: "free",
          planOverride: null,
          periodEnd: null,
          graceUntil: null,
          stripeCustomerId: null,
        },
      ],
      [
        OTHER,
        {
          id: OTHER,
          plan: "starter",
          planOverride: null,
          periodEnd: null,
          graceUntil: null,
          stripeCustomerId: null,
        },
      ],
    ]),
    teams: new Map(
      [
        [PERSONAL, OWNER, "workspace"],
        [TEAM, OWNER, "team"],
        [SECOND, OWNER, "team"],
        [FOREIGN, OTHER, "team"],
      ].map(([id, ownerId, kind]) => [
        id,
        {
          id,
          ownerId,
          kind,
          name: "Team",
          slug: id,
          logoKey: null,
          logoBytes: null,
          logoType: null,
          createdAt: new Date(),
        },
      ])
    ),
  };
});
function existing(teamId, sizeBytes, extra = {}) {
  const row = {
    id: randomUUID(),
    teamId,
    uploaderId: OTHER,
    sizeBytes,
    storageKey: randomUUID(),
    filename: "file.pdf",
    contentType: "application/pdf",
    createdAt: new Date(),
    ...extra,
  };
  state.files.push(row);
  return row;
}
function upload(
  path = `/tasks/${TASK}/attachments`,
  size = 6,
  method = "POST",
  type = "image/jpeg"
) {
  const body = new FormData();
  // Small signature fixtures preserve the exact quota arithmetic in these tests.
  const bytes = new Uint8Array(size);
  const signature =
    type === "application/pdf" ? Buffer.from("%PDF-") : Buffer.from([255, 216, 255]);
  bytes.set(signature.subarray(0, Math.min(size, signature.length)));
  body.set("file", new File([bytes], "file", { type }));
  return app.request(path, { method, body });
}

test("account usage includes personal/team uploads by any member and all logos, excluding joined workspaces", async () => {
  existing(PERSONAL, 100);
  existing(TEAM, 200);
  existing(SECOND, 300, { uploaderId: OWNER });
  existing(FOREIGN, 900);
  state.teams.get(PERSONAL).logoBytes = 10;
  state.teams.get(SECOND).logoBytes = 20;
  state.teams.get(FOREIGN).logoBytes = 700;
  assert.equal(await usedBytesOfOwner(OWNER), 630);
  assert.equal(await usedBytesOfOwner(OTHER), 1600);
  const account = await storageAccountForTeam(TEAM);
  assert.equal(account.ownerId, OWNER);
  assert.equal(account.limits.storageBytes, GiB);
});
test("new workspaces cannot multiply storage; tasks/comments charge the owner rather than uploader", async () => {
  existing(PERSONAL, GiB - 5);
  for (const path of [
    `/tasks/${TASK}/attachments`,
    `/tasks/${SECOND_TASK}/attachments`,
    `/comments/${COMMENT}/attachments`,
  ]) {
    const r = await upload(path);
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, "quota_exceeded");
  }
  assert.equal(state.puts.length, 0);
});
test("concurrent uploads in separate workspaces serialize on their owner and cannot exceed the shared cap", async () => {
  existing(PERSONAL, GiB - 6);
  let staged = 0;
  let release;
  const bothStaged = new Promise((resolve) => {
    release = resolve;
  });
  state.onPut = async () => {
    if (++staged === 2) release();
    await bothStaged;
  };
  const results = await Promise.all([upload(), upload(`/tasks/${SECOND_TASK}/attachments`)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await usedBytesOfOwner(OWNER), GiB);
  assert.deepEqual(state.ownerLocks, [OWNER, OWNER]);
  assert.equal(state.puts.length, 2);
  assert.equal(state.removed.length, 1);
  assert.equal(state.objects.size, 1);
});
test("owner plan overrides apply and an in-flight downgrade is checked before committing", async () => {
  existing(PERSONAL, GiB + 1);
  state.users.get(OWNER).planOverride = "starter";
  assert.equal((await upload()).status, 201);
  state.onPut = () => {
    state.users.get(OWNER).planOverride = null;
  };
  assert.equal((await upload()).status, 409);
  assert.equal(state.removed.length, 1);
  assert.equal(state.files.length, 2);
});
test("logo replacement counts the new size once and cleans the previous object", async () => {
  state.actor = OWNER;
  existing(PERSONAL, GiB - 6);
  Object.assign(state.teams.get(TEAM), {
    logoKey: "old-logo",
    logoBytes: 10,
    logoType: "image/png",
  });
  state.objects.set("old-logo", new Uint8Array(10));
  assert.equal((await upload(`/teams/${TEAM}/logo`, 6, "PUT")).status, 200);
  assert.equal(await usedBytesOfOwner(OWNER), GiB);
  assert.ok(state.teams.get(TEAM).logoKey.startsWith(`teams/${TEAM}/logos/`));
  assert.deepEqual(state.removed, ["old-logo"]);
  assert.equal(state.objects.size, 1);
});
test("a logo rejected after an in-flight quota change preserves its previous object and metadata", async () => {
  state.actor = OWNER;
  Object.assign(state.teams.get(TEAM), {
    logoKey: "old-logo",
    logoBytes: 2,
    logoType: "image/png",
  });
  state.objects.set("old-logo", new Uint8Array(2));
  state.onPut = () => existing(SECOND, GiB);
  assert.equal((await upload(`/teams/${TEAM}/logo`, 6, "PUT")).status, 409);
  assert.equal(state.teams.get(TEAM).logoKey, "old-logo");
  assert.equal(state.teams.get(TEAM).logoBytes, 2);
  assert.deepEqual([...state.objects.keys()], ["old-logo"]);
});
test("failed metadata writes clean staged objects and preserve the current logo", async () => {
  state.actor = OWNER;
  state.failWrite = true;
  Object.assign(state.teams.get(TEAM), { logoKey: "old-logo", logoBytes: 2 });
  state.objects.set("old-logo", new Uint8Array(2));
  assert.equal((await upload()).status, 500);
  assert.equal((await upload(`/teams/${TEAM}/logo`, 6, "PUT")).status, 500);
  assert.deepEqual([...state.objects.keys()], ["old-logo"]);
  assert.equal(state.removed.length, 2);
});
test("over-quota owners can still download, delete existing uploads and remove logos", async () => {
  const f = existing(TEAM, GiB + 10);
  assert.equal((await app.request(`/attachments/${f.id}/download`)).status, 200);
  assert.equal((await app.request(`/attachments/${f.id}`, { method: "DELETE" })).status, 204);
  state.actor = OWNER;
  Object.assign(state.teams.get(TEAM), { logoKey: "old-logo", logoBytes: 20 });
  assert.equal((await app.request(`/teams/${TEAM}/logo`, { method: "DELETE" })).status, 200);
  assert.equal(await usedBytesOfOwner(OWNER), 0);
});
test("billing reports the signed-in account own usage without including other owners", async () => {
  existing(PERSONAL, 100);
  existing(TEAM, 200);
  existing(FOREIGN, 900);
  state.actor = OWNER;
  const r = await app.request("/me/billing");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body.storage, { scope: "account", used_bytes: 300 });
  assert.equal(body.caps.storage_bytes, GiB);
});
test("workspace membership, uploader deletion and owner logo permissions remain enforced", async () => {
  state.member = false;
  assert.equal((await upload()).status, 403);
  state.member = true;
  assert.equal((await upload(`/teams/${TEAM}/logo`, 6, "PUT")).status, 403);
  const f = existing(TEAM, 4, { uploaderId: OWNER });
  assert.equal((await app.request(`/attachments/${f.id}`, { method: "DELETE" })).status, 403);
  assert.equal(state.puts.length, 0);
});
test("unlimited storage stays unlimited and missing workspaces do not acquire an allowance", async () => {
  assert.equal(await storageAccountForTeam(randomUUID()), null);
  assert.equal(await storageUploadDenial({ ownerId: OWNER, limits: UNLIMITED }, GiB * 1000), null);
  assert.equal(state.queries.length, 0);
});

test("the owner's per-file cap applies even when a paid teammate uploads", async () => {
  const account = await storageAccountForTeam(TEAM);
  assert.equal((await storageUploadDenial(account, 25 * 1024 ** 2 + 1)).error, "file_too_large");
  assert.equal(state.queries.length, 0);
});

test("object-store failure cannot add metadata or replace the current logo", async () => {
  state.actor = OWNER;
  state.failPut = true;
  Object.assign(state.teams.get(TEAM), { logoKey: "old-logo", logoBytes: 2 });
  state.objects.set("old-logo", new Uint8Array(2));
  assert.equal((await upload()).status, 503);
  assert.equal((await upload(`/teams/${TEAM}/logo`, 6, "PUT")).status, 503);
  assert.equal(state.files.length, 0);
  assert.equal(state.teams.get(TEAM).logoKey, "old-logo");
  assert.equal(state.ownerLocks.length, 0);
});

test("a workspace removed while an object is uploading leaves no file metadata or staged object", async () => {
  state.onPut = () => state.teams.delete(TEAM);
  assert.equal((await upload()).status, 404);
  assert.equal(state.files.length, 0);
  assert.equal(state.objects.size, 0);
});

test("task/comment images enforce the 3 MB boundary on every plan; PDFs retain plan limits", async () => {
  const cap = 3 * 1024 ** 2;
  for (const plan of ["free", "starter", "pro", "ultra"]) {
    state.users.get(OWNER).plan = plan;
    for (const path of [`/tasks/${TASK}/attachments`, `/comments/${COMMENT}/attachments`]) {
      const puts = state.puts.length;
      const rejected = await upload(path, cap + 1);
      assert.equal(rejected.status, 400);
      const body = await rejected.json();
      assert.equal(body.error, "file_too_large");
      assert.match(body.message, /3 MB/);
      assert.equal(state.puts.length, puts, "Reject oversized images before uploading to storage");
      assert.equal((await upload(path, cap)).status, 201);
      assert.equal((await upload(path, cap + 1, "POST", "application/pdf")).status, 201);
    }
    state.files = [];
  }
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=",
  "base64"
);
function rawUpload(path, bytes, type, method = "POST") {
  const body = new FormData();
  body.set("file", new File([bytes], "image.png", { type }));
  return app.request(path, { method, body });
}

test("new task/comment/logo uploads reject active content and spoofed image labels before object writes", async () => {
  state.actor = OWNER;
  Object.assign(state.teams.get(TEAM), {
    logoKey: "old-logo",
    logoBytes: 10,
    logoType: "image/png",
  });
  state.objects.set("old-logo", PNG);
  const invalid = [
    [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>test()</script></svg>'),
      "image/svg+xml",
    ],
    [Buffer.from("<svg></svg>"), "image/png"],
    [Buffer.from("<html><script>test()</script></html>"), "image/jpeg"],
    [Buffer.from("<?xml version='1.0'?><svg/>"), ""],
    [PNG, "image/jpeg"],
    [Buffer.from("%PDF-1.7"), "image/png"],
    [Buffer.from("not an image"), "image/gif"],
    [new Uint8Array(), "image/png"],
  ];
  for (const [path, method] of [
    [`/tasks/${TASK}/attachments`, "POST"],
    [`/comments/${COMMENT}/attachments`, "POST"],
    [`/teams/${TEAM}/logo`, "PUT"],
  ]) {
    for (const [bytes, type] of invalid) {
      const response = await rawUpload(path, bytes, type, method);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "unsupported_type");
    }
  }
  assert.equal(state.puts.length, 0);
  assert.equal(state.files.length, 0);
  assert.equal(state.teams.get(TEAM).logoKey, "old-logo");
  assert.deepEqual([...state.objects.keys()], ["old-logo"]);
});

test("supported image signatures store a canonical type across all upload surfaces", async () => {
  state.actor = OWNER;
  const fixtures = [
    [PNG, "image/png"],
    [Buffer.from([255, 216, 255, 224]), "image/jpeg"],
    [Buffer.from("GIF89a"), "image/gif"],
    [Buffer.from("RIFF0000WEBP"), "image/webp"],
  ];
  for (const [path, method] of [
    [`/tasks/${TASK}/attachments`, "POST"],
    [`/comments/${COMMENT}/attachments`, "POST"],
    [`/teams/${TEAM}/logo`, "PUT"],
  ]) {
    for (const [bytes, type] of fixtures) {
      const response = await rawUpload(path, bytes, type, method);
      assert.equal(response.status, method === "PUT" ? 200 : 201);
      assert.equal(state.contentTypes.get(state.puts.at(-1)), type);
      if (method === "PUT") assert.equal(state.teams.get(TEAM).logoType, type);
      else assert.equal((await response.json()).attachment.content_type, type);
    }
  }
});

test("missing MIME labels are inferred from content and cannot bypass the image size cap", async () => {
  state.actor = OWNER;
  assert.equal((await rawUpload(`/teams/${TEAM}/logo`, PNG, "", "PUT")).status, 200);
  const oversized = new Uint8Array(3 * 1024 ** 2 + 1);
  oversized.set(PNG);
  for (const path of [`/tasks/${TASK}/attachments`, `/comments/${COMMENT}/attachments`]) {
    const accepted = await rawUpload(path, PNG, "");
    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json()).attachment.content_type, "image/png");
    const puts = state.puts.length;
    const rejected = await rawUpload(path, oversized, "");
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error, "file_too_large");
    assert.equal(state.puts.length, puts);
    assert.equal((await rawUpload(path, oversized, "application/pdf")).status, 400);
  }
});

test("PDF signatures remain accepted for attachments but never for logos", async () => {
  state.actor = OWNER;
  for (const path of [`/tasks/${TASK}/attachments`, `/comments/${COMMENT}/attachments`]) {
    const response = await rawUpload(path, Buffer.from("%PDF-1.7"), "application/pdf");
    assert.equal(response.status, 201);
    assert.equal((await response.json()).attachment.content_type, "application/pdf");
    assert.equal((await rawUpload(path, PNG, "application/pdf")).status, 400);
  }
  assert.equal(
    (await rawUpload(`/teams/${TEAM}/logo`, Buffer.from("%PDF-1.7"), "application/pdf", "PUT"))
      .status,
    400
  );
});

test("legacy active/unsupported logos are blocked regardless of database or object MIME labels", async () => {
  Object.assign(state.teams.get(TEAM), { logoKey: "legacy-logo", logoType: "image/png" });
  state.contentTypes.set("legacy-logo", "image/png");
  for (const bytes of [
    Buffer.from("<svg><script>test()</script></svg>"),
    Buffer.from("<html>active</html>"),
    Buffer.from("%PDF-1.7"),
    new Uint8Array(),
  ]) {
    state.objects.set("legacy-logo", bytes);
    const response = await app.request(`/teams/${TEAM}/logo`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "unsupported_type");
  }
  assert.equal(state.teams.get(TEAM).logoKey, "legacy-logo", "No destructive legacy migration");
});

test("logo reads derive passive MIME from bytes and set safe serving headers", async () => {
  Object.assign(state.teams.get(TEAM), { logoKey: "legacy-logo", logoType: "text/html" });
  state.objects.set("legacy-logo", PNG);
  state.contentTypes.set("legacy-logo", "image/svg+xml");
  const response = await app.request(`/teams/${TEAM}/logo`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.equal(response.headers.get("cache-control"), "private, no-cache");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
});

test("legacy attachment downloads remain forced downloads with safe serving headers", async () => {
  const attachment = existing(TEAM, 24, {
    contentType: "image/svg+xml",
    filename: "old.svg",
    storageKey: "old.svg",
  });
  const bytes = Buffer.from("<svg><script>test()</script></svg>");
  state.objects.set(attachment.storageKey, bytes);
  const response = await app.request(`/attachments/${attachment.id}/download`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /^attachment;/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});
