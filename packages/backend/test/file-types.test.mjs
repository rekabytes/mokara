import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFileType, detectImageType, isRasterImageType } from "../src/lib/file-types.ts";

test("only PNG, JPEG, GIF and WebP signatures classify as inline images", () => {
  for (const [bytes, type] of [
    [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"],
    [Buffer.from([255, 216, 255]), "image/jpeg"],
    [Buffer.from("GIF87a"), "image/gif"],
    [Buffer.from("GIF89a"), "image/gif"],
    [Buffer.from("RIFF0000WEBP"), "image/webp"],
  ]) {
    assert.equal(detectImageType(bytes), type);
    assert.equal(detectFileType(bytes), type);
    assert.equal(isRasterImageType(type), true);
  }
});

test("PDF classification never grants inline image eligibility", () => {
  assert.equal(detectFileType(Buffer.from("%PDF-1.7")), "application/pdf");
  assert.equal(detectImageType(Buffer.from("%PDF-1.7")), null);
  assert.equal(isRasterImageType("application/pdf"), false);
});

test("active markup, unsupported and incomplete signatures are rejected", () => {
  for (const bytes of [
    Buffer.from("<svg><script>test()</script></svg>"),
    Buffer.from("<html>test</html>"),
    Buffer.from("<?xml version='1.0'?><svg/>"),
    Buffer.from("RIFF0000WAVE"),
    Buffer.from("RIFF0000WEB"),
    Buffer.from("GIF89"),
    Buffer.from([255, 216]),
    Buffer.from([137, 80, 78, 71]),
    Buffer.from("%PDF"),
    new Uint8Array(),
  ]) {
    assert.equal(detectImageType(bytes), null);
    assert.equal(detectFileType(bytes), null);
  }
  for (const type of [
    "image/svg+xml",
    "image/avif",
    "text/html",
    "image/",
    "application/octet-stream",
  ])
    assert.equal(isRasterImageType(type), false);
});

test("classification honors the boundaries of a Uint8Array view", () => {
  const backing = Buffer.from("ignoredGIF89aignored");
  assert.equal(
    detectImageType(new Uint8Array(backing.buffer, backing.byteOffset + 7, 6)),
    "image/gif"
  );
  assert.equal(detectImageType(new Uint8Array(backing.buffer, backing.byteOffset + 7, 5)), null);
});
