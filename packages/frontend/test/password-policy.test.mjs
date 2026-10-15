import assert from "node:assert/strict";
import { test } from "node:test";
import * as client from "../lib/password-policy.ts";
import * as backend from "../../backend/src/lib/password-policy.ts";
import { normalizeError, manualError } from "../lib/errors.ts";

test("browser and backend rules and guidance stay aligned at ASCII and Unicode boundaries", () => {
  assert.equal(client.PASSWORD_MIN_CHARACTERS, backend.PASSWORD_MIN_CHARACTERS);
  assert.equal(client.PASSWORD_MAX_BYTES, backend.PASSWORD_MAX_BYTES);
  assert.equal(client.PASSWORD_GUIDANCE, backend.PASSWORD_GUIDANCE);
  const samples = ["", "abcdefg", "abcdefgh", "😀".repeat(4), "  secret123  "];
  for (const character of ["a", "é", "界", "😀", "e\u0301"]) {
    for (let count = 1; count <= 75; count++) samples.push(character.repeat(count));
  }
  for (const password of samples) {
    const error = client.newPasswordError(password);
    assert.equal(error, backend.newPasswordError(password));
    const valid =
      Array.from(password).length >= 8 && new TextEncoder().encode(password).byteLength <= 72;
    assert.equal(error === null, valid);
  }
});

test("new-password errors use the unified inline error path without exposing the password", () => {
  for (const password of ["private", "private-long-password".repeat(10)]) {
    const message = client.newPasswordError(password);
    assert.ok(message);
    assert.equal(message.includes(password), false);
    const local = manualError(message);
    const server = normalizeError({ error: "invalid_input", message, status: 400 });
    assert.equal(local.action, "inline");
    assert.equal(server.action, "inline");
    assert.equal(local.message, message);
    assert.equal(server.message, message);
  }
});
