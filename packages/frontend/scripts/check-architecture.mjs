import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import ts from "typescript";

const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const sharedRoots = ["components/", "hooks/", "lib/"];
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;

function routeOwner(file) {
  if (!file.startsWith("app/")) return null;
  const segments = file.split("/").slice(1, -1);
  const first = segments.findIndex((segment) => !segment.startsWith("("));
  return first < 0 ? "app" : `app/${segments.slice(0, first + 1).join("/")}`;
}

/** Checks production source only. Type imports obey ownership but create no
 * runtime edge; literal dynamic imports and require calls do create edges. */
export function checkArchitecture(files) {
  const errors = new Set();
  const graph = new Map();
  const clientRoots = new Set();
  const serverModules = new Set();
  const report = (file, message) => errors.add(`${file}: ${message}`);

  for (const [file, source] of files) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const dependencies = [];
    graph.set(file, []);
    if (
      tree.statements.some(
        (node) =>
          ts.isExpressionStatement(node) &&
          ts.isStringLiteral(node.expression) &&
          node.expression.text === "use client"
      )
    )
      clientRoots.add(file);
    if (/\.server\.[cm]?[jt]sx?$/.test(file)) serverModules.add(file);
    function dependency(node, runtime) {
      if (node && ts.isStringLiteralLike(node))
        dependencies.push({ specifier: node.text, runtime });
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const onlyTypes =
          clause?.isTypeOnly ||
          (clause?.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            !clause.name &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((item) => item.isTypeOnly));
        dependency(node.moduleSpecifier, !onlyTypes);
      } else if (ts.isExportDeclaration(node)) {
        const onlyTypes =
          node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((item) => item.isTypeOnly));
        dependency(node.moduleSpecifier, !onlyTypes);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        dependency(node.moduleReference.expression, !node.isTypeOnly);
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        dependency(node.arguments[0], true);
      }
      // Runtime environment must stay on the server. Public values and the
      // framework's NODE_ENV replacement are the only browser exceptions.
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(tree) === "process" &&
        node.expression.name.text === "env" &&
        node.name.text !== "NODE_ENV" &&
        !node.name.text.startsWith("NEXT_PUBLIC_")
      )
        serverModules.add(file);
      if (ts.isElementAccessExpression(node) && node.expression.getText(tree) === "process.env") {
        const key = node.argumentExpression;
        if (
          !key ||
          !ts.isStringLiteralLike(key) ||
          (key.text !== "NODE_ENV" && !key.text.startsWith("NEXT_PUBLIC_"))
        )
          serverModules.add(file);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
    for (const { specifier, runtime } of dependencies) {
      if (/^@mokara\/(?:backend|admin|db|redis)(?:\/|$)/.test(specifier))
        report(file, `application/infrastructure import ${specifier}`);
      if (
        runtime &&
        (builtins.has(specifier) ||
          ["next/headers", "next/server", "server-only"].includes(specifier))
      )
        serverModules.add(file);
      const local = specifier.startsWith("@/")
        ? specifier.slice(2)
        : specifier.startsWith(".")
          ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
          : null;
      if (local === null) continue;
      if (local.startsWith("../")) {
        report(file, `import leaves frontend package: ${specifier}`);
        continue;
      }
      const target = [
        local,
        ...[".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx"].map(
          (extension) => local + extension
        ),
      ].find((candidate) => files.has(candidate));
      if (!target) {
        if (!path.posix.extname(local) || sourceExtension.test(local))
          report(file, `unresolved local source import ${specifier}`);
        continue;
      }
      if (sharedRoots.some((prefix) => file.startsWith(prefix)) && target.startsWith("app/"))
        report(file, `shared module imports route internals: ${specifier}`);
      const owner = routeOwner(file),
        targetOwner = routeOwner(target);
      if (owner && targetOwner && owner !== targetOwner)
        report(file, `imports another route's internals: ${specifier}`);
      if (runtime) graph.get(file).push(target);
    }
  }
  const visited = new Set(),
    active = new Set();
  function cycle(file, trail) {
    if (active.has(file)) {
      report(file, `runtime import cycle: ${[...trail, file].join(" → ")}`);
      return;
    }
    if (visited.has(file)) return;
    active.add(file);
    for (const next of graph.get(file)) cycle(next, [...trail, file]);
    active.delete(file);
    visited.add(file);
  }
  for (const file of graph.keys()) cycle(file, []);
  for (const root of clientRoots) {
    const seen = new Set();
    function browser(file, trail) {
      if (seen.has(file)) return;
      seen.add(file);
      if (serverModules.has(file))
        report(root, `client graph reaches server module: ${[...trail, file].join(" → ")}`);
      for (const next of graph.get(file)) browser(next, [...trail, file]);
    }
    browser(root, []);
  }
  return [...errors];
}

function readSources(root) {
  const files = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", "test", "scripts", "public"].includes(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (sourceExtension.test(entry.name) && !entry.name.endsWith(".d.ts"))
        files.set(
          path.relative(root, absolute).split(path.sep).join("/"),
          fs.readFileSync(absolute, "utf8")
        );
    }
  }
  walk(root);
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = readSources(root);
  const errors = checkArchitecture(files);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log(`Architecture check passed (${files.size} production modules).`);
}
