import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const failures = [];
async function source(relative) {
  return readFile(path.join(root, relative), "utf8");
}
async function frontendSources(directory = "packages/frontend") {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (["node_modules", ".next", "test", "public", "scripts"].includes(entry.name)) return [];
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) return frontendSources(relative);
      return /\.(?:ts|tsx|mjs)$/.test(entry.name) ? [await source(relative)] : [];
    })
  );
  return files.flat();
}
const contracts = [
  [
    "backend",
    [...(await source("packages/backend/src/env.ts")).matchAll(/^    ([A-Z][A-Z0-9_]*): z/gm)].map(
      (m) => m[1]
    ),
  ],
  [
    "admin",
    [...(await source("packages/admin/src/env.ts")).matchAll(/^    ([A-Z][A-Z0-9_]*): z/gm)].map(
      (m) => m[1]
    ),
  ],
  [
    "db",
    [...(await source("packages/db/prisma/seed.ts")).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)]
      .map((m) => m[1])
      .filter((name) => name !== "NODE_ENV"),
  ],
  [
    "frontend",
    [
      ...(await frontendSources())
        .join("\n")
        .matchAll(/(?:process\.env\.|settings\.)([A-Z][A-Z0-9_]*)|\benv\("([A-Z][A-Z0-9_]*)"\)/g),
    ]
      .map((m) => m[1] ?? m[2])
      .filter((name) => !["NODE_ENV", "NEXT_RUNTIME"].includes(name)),
  ],
];
for (const [pkg, names] of contracts) {
  const filename = `packages/${pkg}/.env.example`;
  const entries = new Map(
    [...(await source(filename)).matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((m) => [
      m[1],
      m[2].trim(),
    ])
  );
  for (const name of new Set(names)) {
    if (!entries.has(name)) failures.push(`${filename}: missing ${name}`);
  }
  for (const [name, value] of entries) {
    if (/(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|ACCESS_KEY)/.test(name) && value) {
      failures.push(`${filename}: ${name} must be blank; document how to generate it`);
    }
    if (/mokara\.my/i.test(value))
      failures.push(`${filename}: ${name} must not point to the hosted service`);
  }
}
// Check paths only: never read or print local environment values.
const git = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
const tracked = git.status === 0 ? git.stdout.split("\0") : [];
if (git.status !== 0) console.warn("Git tracking check skipped: Git checkout unavailable.");
for (const filename of tracked) {
  if (/(?:^|\/)\.env(?:\.|$)/.test(filename) && !/\.env\.(?:example|template)$/.test(filename))
    failures.push(`Sensitive environment file is tracked: ${filename}`);
  if (/\.(?:pem|key|p12)$/.test(filename))
    failures.push(`Private-key container is tracked: ${filename}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Environment examples cover application settings and secret fields are blank." +
      (git.status === 0 ? " Sensitive file paths are untracked." : "")
  );
}
