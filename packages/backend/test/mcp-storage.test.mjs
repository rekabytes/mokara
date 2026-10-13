import { test, mock } from "node:test";
import assert from "node:assert/strict";
let response, command, cancelled;
mock.module("@aws-sdk/client-s3", {
  namedExports: {
    S3Client: class {
      async send(input) {
        command = input;
        return response;
      }
    },
    GetObjectCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    PutObjectCommand: class {},
    DeleteObjectCommand: class {},
  },
});
mock.module("../src/env.ts", {
  namedExports: { env: { S3_BUCKET: "test" }, storageConfigured: true },
});
mock.module("../src/lib/logger.ts", { namedExports: { log: { error() {} } } });
const { getObjectChunk } = await import("../src/lib/storage.ts");
function body(bytes) {
  cancelled = false;
  return {
    transformToWebStream: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(bytes));
        },
        cancel() {
          cancelled = true;
        },
      }),
  };
}
test("storage sends a bounded range, rejects oversized responses and cancels their stream", async () => {
  response = { Body: body([1, 2, 3, 4]), ContentRange: "bytes 4-7/8" };
  await assert.rejects(getObjectChunk("key", 4, 3), /exceeded limit/);
  assert.equal(command.input.Range, "bytes=4-6");
  assert.equal(cancelled, true);
});
test("storage rejects an ignored nonzero range and releases its stream", async () => {
  response = { Body: body([1]) };
  await assert.rejects(getObjectChunk("key", 4, 3), /did not honor/);
  assert.equal(cancelled, true);
});
test("storage returns only the requested bytes", async () => {
  response = {
    Body: {
      transformToWebStream: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([5, 6]));
            controller.close();
          },
        }),
    },
    ContentRange: "bytes 4-5/6",
  };
  assert.deepEqual(await getObjectChunk("key", 4, 2), new Uint8Array([5, 6]));
});
