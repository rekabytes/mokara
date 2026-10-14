import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

function validate(module, settings) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", `await import(${JSON.stringify(module)});`],
    {
      cwd: new URL("../", import.meta.url),
      env: {
        PATH: process.env.PATH,
        DOTENV_CONFIG_PATH: "/dev/null",
        DATABASE_URL: "postgresql://isolated.invalid/test",
        ...settings,
      },
      encoding: "utf8",
    }
  );
}
test("production rejects missing, short and published authentication keys", () => {
  for (const AUTH_SECRET of [
    "",
    "short",
    "change-me-to-a-32-byte-random-string-or-longer",
    "dev-only-insecure-secret-change-me-in-prod-32b!",
  ]) {
    assert.notEqual(validate("./src/env.ts", { ENV: "production", AUTH_SECRET }).status, 0);
  }
  assert.equal(
    validate("./src/env.ts", { ENV: "production", AUTH_SECRET: randomBytes(48).toString("base64") })
      .status,
    0
  );
  assert.equal(validate("./src/env.ts", { ENV: "development", AUTH_SECRET: "" }).status, 0);
});
test("admin requires an explicit backend address and production secrets", () => {
  const settings = {
    ENV: "production",
    ADMIN_TOKEN_SECRET: randomBytes(48).toString("base64"),
    ADMIN_URL_KEY: randomBytes(16).toString("hex"),
  };
  assert.notEqual(validate("../admin/src/env.ts", settings).status, 0);
  assert.notEqual(
    validate("../admin/src/env.ts", { ...settings, BACKEND_URL: "not-a-url" }).status,
    0
  );
  assert.equal(
    validate("../admin/src/env.ts", { ...settings, BACKEND_URL: "http://127.0.0.1:4700" }).status,
    0
  );
});
