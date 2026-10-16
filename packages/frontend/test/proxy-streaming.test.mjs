import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as proxy, GET as getProxy } from "../app/api/[...path]/route.ts";

function input(t, method = "POST", body = null) {
  const original = process.env.BACKEND_URL;
  process.env.BACKEND_URL = "http://backend.invalid:4700";
  t.after(() => {
    if (original === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = original;
  });
  const controller = new AbortController();
  return {
    method,
    body,
    signal: controller.signal,
    nextUrl: new URL("https://mokara.invalid/api/teams/workspace/files?upload_id=test"),
    headers: new Headers({
      cookie: "session=test",
      "content-type": "multipart/form-data; boundary=test",
      "content-length": "1000000",
    }),
    arrayBuffer: () => {
      throw new Error("Proxy must not buffer the body");
    },
  };
}

test("uploads are forwarded before the proxy reads any body bytes", async (t) => {
  let pulls = 0;
  const body = new ReadableStream(
    {
      pull() {
        pulls++;
      },
    },
    { highWaterMark: 0 }
  );
  const request = input(t, "POST", body);
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(pulls, 0);
    assert.equal(init.body, body);
    assert.equal(init.duplex, "half");
    assert.equal(init.signal, request.signal);
    assert.equal(init.headers.get("cookie"), "session=test");
    assert.equal(init.headers.has("content-length"), false);
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
    assert.equal(url.pathname, request.nextUrl.pathname);
    assert.equal(url.search, request.nextUrl.search);
    return Response.json(
      { error: "not_authenticated", message: "login required" },
      { status: 401 }
    );
  });
  const response = await proxy(request);
  assert.equal(response.status, 401);
  assert.equal(pulls, 0);
  await body.cancel();
});

test("stream forwarding preserves multipart bytes exactly and multiple response cookies", async (t) => {
  const bytes = new TextEncoder().encode(
    '--test\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\n\r\n%PDF-1.7\r\n--test--\r\n'
  );
  const body = new ReadableStream({
    start(c) {
      c.enqueue(bytes.subarray(0, 20));
      c.enqueue(bytes.subarray(20));
      c.close();
    },
  });
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.deepEqual(new Uint8Array(await new Response(init.body).arrayBuffer()), bytes);
    const headers = new Headers();
    headers.append("set-cookie", "one=1; HttpOnly");
    headers.append("set-cookie", "two=2; HttpOnly");
    return Response.json({ ok: true }, { headers });
  });
  const response = await proxy(input(t, "POST", body));
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 2);
});

test("early backend access/size errors retain their normal envelopes", async (t) => {
  for (const [status, error] of [
    [403, "forbidden"],
    [413, "payload_too_large"],
  ]) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error, message: "Rejected" }, { status })
    );
    const response = await proxy(input(t));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error, message: "Rejected" });
  }
});

test("bodyless requests omit streaming mode and preserve streaming responses", async (t) => {
  const upstream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("event: ping\ndata: 1\n\n"));
      c.close();
    },
  });
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.body, null);
    assert.equal(init.duplex, undefined);
    return new Response(upstream, { headers: { "content-type": "text/event-stream" } });
  });
  const response = await getProxy(input(t, "GET"));
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.match(await response.text(), /event: ping/);
});

test("stream transport failures use the shared safe error envelope", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("private stream failure");
  });
  const log = t.mock.method(console, "error", () => {});
  const response = await proxy(input(t));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "network_error",
    message: "Backend unavailable",
  });
  assert.equal(JSON.stringify(log.mock.calls).includes("private stream failure"), false);
});
