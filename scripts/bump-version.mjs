#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPaths = [
  "package.json",
  "packages/admin/package.json",
  "packages/backend/package.json",
  "packages/db/package.json",
  "packages/frontend/package.json",
  "packages/redis/package.json",
];
const releaseReferences = [
  { path: ".github/workflows/release.yml", seriesTag: false },
  { path: "README.md", seriesTag: true },
  { path: "docs/development/PRD-07.md", seriesTag: true },
];
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  console.error(`Version error: ${message}`);
  process.exitCode = 1;
}

function parseVersion(value, label) {
  const normalized = value.startsWith("v") ? value.slice(1) : value;
  const match = semverPattern.exec(normalized);
  if (!match) throw new Error(`${label} must be a stable semantic version (x.y.z), got "${value}"`);
  return { value: normalized, parts: match.slice(1).map(Number) };
}

function nextVersion(current, bump) {
  const [major, minor, patch] = current.parts;
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  return parseVersion(bump, "target version").value;
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

async function readProject() {
  const manifests = await Promise.all(
    manifestPaths.map(async (path) => {
      const text = await readFile(resolve(root, path), "utf8");
      const json = JSON.parse(text);
      return { path, text, version: json.version };
    })
  );
  const references = await Promise.all(
    releaseReferences.map(async (entry) => ({
      ...entry,
      text: await readFile(resolve(root, entry.path), "utf8"),
    }))
  );
  return { manifests, references };
}

function checkProject(project, expectedVersion) {
  const expected = parseVersion(expectedVersion, "expected version");
  const expectedSeries = expected.parts.slice(0, 2).join(".");
  const problems = [];

  for (const manifest of project.manifests) {
    if (manifest.version !== expected.value) {
      problems.push(
        `${manifest.path} is ${manifest.version ?? "missing a version"}, expected ${expected.value}`
      );
    }
  }

  for (const reference of project.references) {
    if (!reference.text.includes(expected.value)) {
      problems.push(`${reference.path} does not reference ${expected.value}`);
    }
    if (reference.seriesTag && !reference.text.includes(`:${expectedSeries}`)) {
      problems.push(`${reference.path} does not reference the :${expectedSeries} image tag`);
    }
  }

  if (problems.length > 0) throw new Error(problems.join("\n"));
  return expected.value;
}

async function check(expectedArg) {
  const project = await readProject();
  const rootVersion = project.manifests[0].version;
  const expected = expectedArg ?? rootVersion;
  const checked = checkProject(project, expected);
  console.log(`Release versions are synchronized at ${checked}.`);
}

async function bump(kind) {
  const project = await readProject();
  const current = parseVersion(project.manifests[0].version, "root package version");

  // Refuse to build on an already-divergent release. This keeps a bump from
  // hiding an accidental manual edit in one workspace or release example.
  checkProject(project, current.value);

  const target = nextVersion(current, kind);
  if (target === current.value) throw new Error(`target version is already ${target}`);

  const currentSeries = current.parts.slice(0, 2).join(".");
  const targetSeries = parseVersion(target, "target version").parts.slice(0, 2).join(".");

  for (const manifest of project.manifests) {
    const needle = `"version": "${current.value}"`;
    if (count(manifest.text, needle) !== 1) {
      throw new Error(`${manifest.path} must contain exactly one ${needle}`);
    }
    manifest.nextText = manifest.text.replace(needle, `"version": "${target}"`);
  }

  for (const reference of project.references) {
    const occurrences = count(reference.text, current.value);
    if (occurrences === 0) throw new Error(`${reference.path} does not reference ${current.value}`);
    let nextText = reference.text.replaceAll(current.value, target);
    if (reference.seriesTag && currentSeries !== targetSeries) {
      nextText = nextText.replaceAll(`:${currentSeries}`, `:${targetSeries}`);
    }
    reference.nextText = nextText;
  }

  for (const file of [...project.manifests, ...project.references]) {
    await writeFile(resolve(root, file.path), file.nextText, "utf8");
  }

  await check(target);
  console.log(`Bumped ${current.value} -> ${target}.`);
}

const args = process.argv.slice(2);

try {
  if (args[0] === "--check") {
    if (args.length > 2) throw new Error("usage: bump-version.mjs --check [x.y.z]");
    await check(args[1]);
  } else {
    if (args.length !== 1) {
      throw new Error("usage: bump-version.mjs <patch|minor|major|x.y.z>");
    }
    await bump(args[0]);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
