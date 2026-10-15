import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { setImmediate as nextTurn } from "node:timers/promises";
import { readUploadFile, MULTIPART_OVERHEAD_BYTES } from "../src/lib/upload-body.ts";
import { limitsFor, UNLIMITED } from "../src/lib/plans.ts";

const URL = "https://upload.invalid/";
const form = (bytes = new Uint8Array(8)) => {
  const data = new FormData();
  data.set("file", new File([bytes], "file.pdf", { type: "application/pdf" }));
  return data;
};
const request = (data, headers = {}) => new Request(URL, { method: "POST", body: data, headers });

async function streamed(data, headers = {}, chunkSize = 1024) {
  const encoded = new Response(data);
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  const observed = { pulls: 0, cancelled: false, total: Math.ceil(bytes.length / chunkSize) };
  let offset = 0;
  const body = new ReadableStream(
    {
      pull(controller) {
        observed.pulls++;
        if (offset >= bytes.length) return controller.close();
        controller.enqueue(bytes.subarray(offset, offset + chunkSize));
        offset += chunkSize;
      },
      cancel() {
        observed.cancelled = true;
      },
    },
    { highWaterMark: 0 }
  );
  return {
    request: new Request(URL, {
      method: "POST",
      body,
      duplex: "half",
      headers: { "content-type": encoded.headers.get("content-type"), ...headers },
    }),
    observed,
  };
}

test("one file at the exact limit passes with normal multipart overhead", async () => {
  const result = await readUploadFile(request(form()), 8);
  assert.ok(result instanceof File);
  assert.equal(result.size, 8);
  assert.equal(result.name, "file.pdf");
});

test("a file over the package limit is rejected even within the framing allowance", async () => {
  const result = await readUploadFile(request(form()), 7);
  assert.equal(result.status, 400);
  assert.equal(result.error, "file_too_large");
});

test("oversized declared requests are rejected before reading for every hosted plan", async () => {
  for (const plan of ["free", "starter", "pro", "ultra"]) {
    const limit = limitsFor(plan).maxFileBytes;
    const source = await streamed(form(), {
      "content-length": String(limit + MULTIPART_OVERHEAD_BYTES + 1),
    });
    const result = await readUploadFile(source.request, limit);
    assert.equal(result.status, 413);
    assert.equal(result.error, "payload_too_large");
    assert.equal(source.observed.pulls, 0);
    assert.equal(source.observed.cancelled, true);
  }
});

test("missing and misleading length headers cannot bypass actual-byte limits", async () => {
  for (const headers of [{}, { "content-length": "1" }]) {
    const data = form();
    data.set("extra", "x".repeat(MULTIPART_OVERHEAD_BYTES * 3));
    const source = await streamed(data, headers);
    const result = await readUploadFile(source.request, 8);
    await nextTurn();
    assert.equal(result.status, 413);
    assert.equal(source.observed.cancelled, true);
    assert.ok(source.observed.pulls < source.observed.total, "Stop reading on the overflow chunk");
  }
});

test("invalid length headers are rejected without consuming input", async () => {
  for (const value of ["-1", "1.5", "10junk", "1e10", "9999999999999999999999999999"]) {
    const source = await streamed(form(), { "content-length": value });
    const result = await readUploadFile(source.request, 8);
    assert.equal(result.status, 400);
    assert.equal(source.observed.pulls, 0);
    assert.equal(source.observed.cancelled, true);
  }
});

test("duplicate/missing/empty files and extra file parts are rejected", async () => {
  const missing = new FormData();
  missing.set("file", "not a file");
  const duplicate = form();
  duplicate.append("file", new File(["second"], "second.pdf"));
  const extraFile = form();
  extraFile.append("other", new File(["second"], "second.pdf"));
  for (const data of [missing, duplicate, extraFile, form(new Uint8Array())]) {
    const result = await readUploadFile(request(data), 100);
    assert.equal(result.status, 400);
    assert.equal(result.error, "invalid_input");
  }
});

test("non-file multipart data cannot consume the file allowance", async () => {
  const data = form();
  data.set("extra", "x".repeat(MULTIPART_OVERHEAD_BYTES + 1));
  const result = await readUploadFile(request(data), MULTIPART_OVERHEAD_BYTES * 2);
  assert.equal(result.status, 413);
});

test("malformed multipart and stream errors return safe input failures", async () => {
  const malformed = request("private malformed body", {
    "content-type": "multipart/form-data; boundary=test",
  });
  const failure = new Request(URL, {
    method: "POST",
    duplex: "half",
    headers: { "content-type": "multipart/form-data; boundary=test" },
    body: new ReadableStream({
      pull(controller) {
        controller.error(new Error("private transport detail"));
      },
    }),
  });
  for (const input of [
    malformed,
    failure,
    request("body", { "content-type": "application/json" }),
  ]) {
    const result = await readUploadFile(input, 100);
    assert.equal(result.status, 400);
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

test("aborted uploads cancel their source and do not return a file", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const input = new Request(URL, {
    method: "POST",
    duplex: "half",
    signal: controller.signal,
    headers: { "content-type": "multipart/form-data; boundary=test" },
    body: new ReadableStream(
      {
        pull() {
          controller.abort();
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 }
    ),
  });
  const result = await readUploadFile(input, 100);
  await nextTurn();
  assert.equal(result.status, 400);
  assert.equal(cancelled, true);
});

test("intentional self-hosted unlimited file policy remains unchanged", async () => {
  assert.ok((await readUploadFile(request(form()), UNLIMITED.maxFileBytes)) instanceof File);
});

test("authentication rejects an upload before the body parser can run", async () => {
  await mock.module("../src/env.ts", {
    namedExports: {
      env: {
        ENV: "development",
        AUTH_SECRET: "test-only-upload-auth-secret-at-least-32-characters",
      },
      isProd: false,
    },
  });
  await mock.module("../src/redis.ts", {
    namedExports: {
      getRedis: () => {
        throw new Error("Unauthenticated request must not access Redis");
      },
    },
  });
  const { authRequired } = await import("../src/middleware/auth.ts");
  const app = new Hono();
  app.use("*", authRequired);
  app.post("/upload", async (c) => {
    await readUploadFile(c.req.raw, 8);
    return c.json({ ok: true });
  });
  const source = await streamed(form());
  const response = await app.request(new Request("https://api.invalid/upload", source.request));
  assert.equal(response.status, 401);
  assert.equal(source.observed.pulls, 0);
  await source.request.body.cancel();
});
