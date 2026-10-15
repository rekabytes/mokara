import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "../src/lib/password.ts";
import {
  passwordSchema,
  signUpSchema,
  loginSchema,
  changePasswordSchema,
} from "../src/lib/validation.ts";
import { newPasswordError, PASSWORD_MAX_BYTES } from "../src/lib/password-policy.ts";

const cases = [
  ["", false],
  ["abcdefg", false],
  ["abcdefgh", true],
  ["a".repeat(72), true],
  ["a".repeat(73), false],
  ["é".repeat(36), true],
  ["é".repeat(37), false],
  ["界".repeat(24), true],
  ["界".repeat(25), false],
  ["😀".repeat(4), false],
  ["😀".repeat(8), true],
  ["😀".repeat(18), true],
  ["😀".repeat(18) + "a", false],
  [" \tsecret \n", true],
  ["x".repeat(100_000), false],
];

test("signup and new-password schemas enforce Unicode minimum and UTF-8 byte boundary", () => {
  for (const [password, valid] of cases) {
    assert.equal(passwordSchema.safeParse(password).success, valid);
    assert.equal(newPasswordError(password) === null, valid);
    assert.equal(signUpSchema.safeParse({ username: "alice", password }).success, valid);
    assert.equal(
      changePasswordSchema.safeParse({ current_password: "old", new_password: password }).success,
      valid
    );
    if (valid) assert.equal(bcrypt.truncates(password), false);
  }
});

test("the accepted maximum matches bcrypt's actual input boundary", async () => {
  const password = "é".repeat(PASSWORD_MAX_BYTES / 2);
  const hash = await hashPassword(password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("e" + password.slice(1), hash), false);
  for (const oversized of [password + "a", "😀".repeat(19), "a".repeat(73)]) {
    assert.equal(bcrypt.truncates(oversized), true);
    await assert.rejects(hashPassword(oversized), RangeError);
  }
  await assert.rejects(hashPassword("short"), RangeError);
});

test("existing long or short passwords remain verifiable without applying new-password rules", async () => {
  for (const password of ["a".repeat(72) + "legacy-tail", "old"]) {
    // Existing hashes predate validation; do not create new hashes this way in application code.
    const hash = await bcrypt.hash(password, 4);
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(loginSchema.safeParse({ username: "alice", password }).success, true);
    const parsed = changePasswordSchema.parse({
      current_password: password,
      new_password: "replacement123",
    });
    assert.equal(parsed.current_password, password);
    assert.equal(passwordSchema.safeParse(password).success, false);
  }
  assert.equal(loginSchema.safeParse({ username: "alice", password: "" }).success, false);
});

test("passwords are not trimmed or normalized before hashing", async () => {
  const password = "  secret123  ";
  assert.equal(passwordSchema.parse(password), password);
  const hash = await hashPassword(password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(password.trim(), hash), false);
  assert.equal(passwordSchema.parse("e\u0301".repeat(8)), "e\u0301".repeat(8));
});
