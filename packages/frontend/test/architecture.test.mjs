import { test } from "node:test";
import assert from "node:assert/strict";
import { checkArchitecture } from "../scripts/check-architecture.mjs";

const check = (sources) => checkArchitecture(new Map(Object.entries(sources)));
const has = (sources, message) => check(sources).some((error) => error.includes(message));

test("route helpers and type-only server contracts are allowed", () => {
  assert.deepEqual(
    check({
      "app/tasks/page.tsx":
        '"use client"; import { read } from "./model"; import type { Result } from "@/lib/config.server";',
      "app/tasks/model.ts": "export const read = 1;",
      "lib/config.server.ts": "export type Result = string;",
    }),
    []
  );
});

test("transitive literal dynamic imports cannot pull server modules into a client", () => {
  assert.ok(
    has(
      {
        "app/tasks/page.tsx": '"use client"; import { read } from "./model";',
        "app/tasks/model.ts": 'export const read = () => import("@/lib/config.server");',
        "lib/config.server.ts": "export const secret = process.env.SECRET;",
      },
      "model.ts → lib/config.server.ts"
    )
  );
});

test("public environment values are allowed but private and computed reads are rejected", () => {
  assert.deepEqual(
    check({
      "components/Safe.tsx":
        '"use client"; const a = process.env.NODE_ENV; const b = process.env.NEXT_PUBLIC_SITE_URL;',
    }),
    []
  );
  for (const expression of ["process.env.SECRET", 'process.env["SECRET"]', "process.env[key]"])
    assert.ok(
      has(
        { "components/Unsafe.tsx": `"use client"; const value = ${expression};` },
        "client graph reaches server module"
      )
    );
});

test("shared, sibling-route and package reach-through imports fail ownership checks", () => {
  const sources = {
    "components/Shared.tsx": 'import { value } from "@/app/tasks/model";',
    "app/settings/page.tsx":
      'import { value } from "../tasks/model"; import { db } from "@mokara/db";',
    "app/tasks/model.ts": "export const value = 1;",
    "lib/escape.ts": 'import { db } from "../../backend/src/db";',
  };
  for (const expected of [
    "shared module imports route internals",
    "imports another route's internals",
    "application/infrastructure import",
    "import leaves frontend package",
  ])
    assert.ok(has(sources, expected));
});

test("runtime cycles and missing imports fail while type-only cycles pass", () => {
  assert.ok(
    has({ "lib/a.ts": 'import "./b";', "lib/b.ts": 'import "./a";' }, "runtime import cycle")
  );
  assert.deepEqual(
    check({
      "lib/a.ts": 'import type { B } from "./b"; export type A = B;',
      "lib/b.ts": 'import type { A } from "./a"; export type B = A;',
    }),
    []
  );
  assert.ok(has({ "lib/a.ts": 'import "./missing";' }, "unresolved local source import"));
});

test("server routes may use server helpers; client Node and Next server imports fail", () => {
  assert.deepEqual(
    check({
      "app/api/route.ts": 'import { read } from "@/lib/config.server";',
      "lib/config.server.ts": 'import { createHmac } from "node:crypto"; export const read = 1;',
    }),
    []
  );
  for (const specifier of ["node:crypto", "next/headers", "server-only"])
    assert.ok(
      has(
        { "components/Client.tsx": `"use client"; import "${specifier}";` },
        "client graph reaches server module"
      )
    );
});
