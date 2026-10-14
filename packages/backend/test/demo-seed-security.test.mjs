import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const root = new URL("../../../", import.meta.url);
function run(script, settings, target, stubFetch = false) {
  const prefix = stubFetch
    ? `globalThis.fetch=async (_url, options)=>{if(options.redirect!=="error") throw Error("redirect guard missing");console.log("MOCK_REQUEST_ONLY");throw Error("STOP_MOCK");};`
    : "";
  const argv = target === undefined ? "" : `process.argv[2]=${JSON.stringify(target)};`;
  const code = `${prefix}${argv}await import(${JSON.stringify(script)});`;
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      DOTENV_CONFIG_PATH: "/dev/null",
      DATABASE_URL: "postgresql://127.0.0.1/demo",
      ...settings,
    },
    encoding: "utf8",
  });
}
test("both seeds reject production and absent explicit opt-in before any IO", () => {
  for (const script of ["./scripts/seed-demo.mjs", "./packages/db/prisma/seed.ts"]) {
    for (const settings of [
      {},
      { ENV: "production", DEMO_SEED_ENABLED: "true" },
      { ENV: "development", NODE_ENV: "production", DEMO_SEED_ENABLED: "true" },
    ]) {
      const result = run(script, settings, "http://127.0.0.1:4700");
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Demo seeding requires ENV=development/);
    }
  }
});
test("database seed rejects remote databases even with development opt-in", () => {
  const result = run("./packages/db/prisma/seed.ts", {
    ENV: "development",
    DEMO_SEED_ENABLED: "true",
    DATABASE_URL: "postgresql://remote.invalid/demo",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /remote databases are forbidden/);
});
test("screenshot seed requires an explicit loopback origin and rejects credentials and URL suffixes", () => {
  for (const target of [
    undefined,
    "https://remote.invalid",
    "http://127.0.0.1.evil.invalid",
    "http://user:pass@localhost:4700",
    "http://localhost:4700/path",
    "http://localhost:4700?target=remote",
    "http://localhost:4700#remote",
  ]) {
    const result = run(
      "./scripts/seed-demo.mjs",
      { ENV: "development", DEMO_SEED_ENABLED: "true" },
      target
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /explicit local backend origin|loopback HTTP/);
  }
});
test("approved local screenshot request refuses redirects and never prints a token", () => {
  const result = run(
    "./scripts/seed-demo.mjs",
    { ENV: "development", DEMO_SEED_ENABLED: "true" },
    "http://127.0.0.1:4700",
    true
  );
  assert.match(result.stdout, /MOCK_REQUEST_ONLY/);
  assert.match(result.stderr, /STOP_MOCK/);
  assert.doesNotMatch(result.stdout, /TOKEN=/);
});
