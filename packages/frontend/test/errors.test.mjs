import { test } from "node:test";
import assert from "node:assert/strict";
import { isApiError, normalizeError, manualError } from "../lib/errors.ts";

test("malformed API envelopes cannot crash normalization", () => {
  for (const value of [
    null,
    { error: "invalid_input", message: 42, status: 400 },
    { error: {}, message: "bad", status: 400 },
    { error: "bad", message: "bad", status: "400" },
    { error: "bad", message: "bad", status: NaN },
    { error: "bad", message: "bad", status: -1 },
    { error: "bad", message: "bad", status: 400.5 },
  ]) {
    assert.equal(isApiError(value), false);
    assert.equal(normalizeError(value).message, "Something went wrong.");
  }
});

test("known input messages and session routing remain intact", () => {
  const input = normalizeError({
    error: "invalid_input",
    message: "Title is required",
    status: 400,
  });
  assert.equal(input.message, "Title is required");
  assert.equal(input.kind, "input");
  const expired = normalizeError({ error: "not_authenticated", message: "private", status: 401 });
  assert.equal(expired.action, "redirect");
  assert.notEqual(expired.message, "private");
});

test("unknown errors retain causes without exposing technical messages", () => {
  for (const cause of [
    new Error("private SQL details"),
    new TypeError("private property access"),
    "private details",
  ]) {
    const error = normalizeError(cause);
    assert.equal(error.message, "Something went wrong.");
    assert.equal(error.code, "unknown");
    assert.equal(error.cause, cause);
    assert.equal(normalizeError(cause, "Could not save.").message, "Could not save.");
  }
});

test("unknown API codes use safe HTTP fallback rules, including prototype names", () => {
  for (const code of ["new_provider_failure", "constructor", "toString", "__proto__"]) {
    const error = normalizeError({ error: code, message: "private upstream details", status: 503 });
    assert.equal(error.code, "service_unavailable");
    assert.equal(error.action, "retry");
    assert.equal(error.retryable, true);
    assert.notEqual(error.message, "private upstream details");
  }
});

test("network and local validation errors keep their explicit classifications", () => {
  const network = normalizeError({ error: "network_error", message: "offline", status: 0 });
  assert.equal(network.kind, "network");
  assert.equal(network.retryable, true);
  assert.equal(manualError("Choose a workspace.").message, "Choose a workspace.");
});
