import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
const env = {
  AUTH_SECRET: "x".repeat(48),
  AUTH_PUBLIC_URL: "https://app.example.test",
  SUPPORT_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  SUPPORT_EMAIL_API_URL: "https://email.example.test/send",
  SUPPORT_EMAIL_API_KEY: "secret",
  SUPPORT_EMAIL_FROM: "support@example.test",
  ENV: "development",
};
let jobs, exists, calls;
const db = {
  supportEmail: {
    findMany: async () =>
      jobs.filter((j) => !j.sentAt && j.attempts < 12 && j.nextAttemptAt <= new Date()),
    updateMany: async ({ where, data }) => {
      if (!where.id) {
        for (const j of jobs)
          if (!j.sentAt && j.createdAt < where.createdAt.lt) Object.assign(j, data);
        return { count: 0 };
      }
      const row = jobs.find(
        (j) =>
          j.id === where.id &&
          !j.sentAt &&
          j.attempts === where.attempts &&
          j.nextAttemptAt <= new Date()
      );
      if (row) {
        row.attempts++;
        row.nextAttemptAt = data.nextAttemptAt;
      }
      return { count: row ? 1 : 0 };
    },
    update: async ({ where, data }) =>
      Object.assign(
        jobs.find((j) => j.id === where.id),
        data
      ),
    deleteMany: async ({ where }) => {
      jobs = jobs.filter((j) => j.id !== where.id);
    },
  },
  supportTicket: { findUnique: async () => (exists ? { id: "ticket" } : null) },
};
await mock.module("../src/env.ts", { namedExports: { env, isHosted: true } });
await mock.module("../src/db.ts", { namedExports: { prisma: db } });
await mock.module("../src/lib/logger.ts", { namedExports: { log: { warn: () => {} } } });
const { encryptSupport, decryptSupport } = await import("../src/lib/support.ts");
const { drainSupportEmails } = await import("../src/lib/support-email.ts");
beforeEach(() => {
  exists = true;
  calls = [];
  jobs = [
    {
      id: "job",
      ticketId: "ticket",
      recipient: "aisha@example.test",
      subject: "Ticket MK-TEST",
      textEncrypted: encryptSupport("Private ticket link"),
      attempts: 0,
      nextAttemptAt: new Date(0),
      sentAt: null,
      createdAt: new Date(),
    },
  ];
});
test("successful email uses provider idempotency and removes queued private content", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return Response.json({ id: "provider-id" });
  });
  await drainSupportEmails();
  assert.equal(calls[0].url, env.SUPPORT_EMAIL_API_URL);
  assert.equal(calls[0].init.headers["Idempotency-Key"], "mokara-support-job");
  assert.equal(JSON.parse(calls[0].init.body).text, "Private ticket link");
  assert.ok(jobs[0].sentAt);
  assert.equal(jobs[0].textEncrypted, "");
  await drainSupportEmails();
  assert.equal(calls.length, 1);
});
test("provider failures preserve ciphertext for bounded retry with the same key", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    calls.push(init);
    return new Response("private provider error", { status: 503 });
  });
  await drainSupportEmails();
  assert.equal(jobs[0].sentAt, null);
  assert.equal(jobs[0].attempts, 1);
  assert.ok(jobs[0].nextAttemptAt > new Date());
  assert.equal(decryptSupport(jobs[0].textEncrypted), "Private ticket link");
  jobs[0].nextAttemptAt = new Date(0);
  await drainSupportEmails();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers["Idempotency-Key"], calls[1].headers["Idempotency-Key"]);
});
test("removed tickets do not send queued emails", async (t) => {
  exists = false;
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must not send");
  });
  await drainSupportEmails();
  assert.equal(jobs.length, 0);
});
test("old deliveries stop before provider idempotency expires", async (t) => {
  jobs[0].createdAt = new Date(Date.now() - 24 * 3600_000);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must not send");
  });
  await drainSupportEmails();
  assert.equal(jobs[0].attempts, 12);
  assert.equal(jobs[0].sentAt, null);
});
test("invalid ciphertext is rejected and authentication secret rotations preserve ticket encryption", () => {
  const ciphertext = jobs[0].textEncrypted;
  assert.throws(() => decryptSupport(ciphertext + "broken"));
  const before = env.AUTH_SECRET;
  env.AUTH_SECRET = "rotated".repeat(8);
  try {
    assert.equal(decryptSupport(ciphertext), "Private ticket link");
  } finally {
    env.AUTH_SECRET = before;
  }
});
