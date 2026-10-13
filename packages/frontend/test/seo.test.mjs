import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import seo from "../lib/seo.server.ts";
const {
  getSeoOrigin,
  getRootMetadata,
  getPublicMetadata,
  getRobots,
  getSitemap,
  getWebsiteStructuredData,
  PUBLIC_PAGES,
  PRIVATE_ROBOTS,
} = seo;

function environment(t, origin, indexable) {
  const keys = ["NEXT_PUBLIC_SITE_URL", "SEO_INDEXABLE"];
  const previous = keys.map((key) => process.env[key]);
  for (const [index, value] of [origin, indexable].entries()) {
    if (value === undefined) delete process.env[keys[index]];
    else process.env[keys[index]] = value;
  }
  t.after(() =>
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    })
  );
}

test("canonical and share URLs follow runtime configuration across deployments", (t) => {
  environment(t, "https://stage.example.invalid", "false");
  for (const origin of ["https://stage.example.invalid", "https://public.example.invalid"]) {
    process.env.NEXT_PUBLIC_SITE_URL = origin;
    assert.equal(getRootMetadata().metadataBase.origin, origin);
    for (const path of Object.keys(PUBLIC_PAGES)) {
      const metadata = getPublicMetadata(path);
      assert.equal(metadata.alternates.canonical, new URL(path, origin).href);
      assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
      assert.equal(metadata.openGraph.images[0].url, `${origin}/social/mokara-preview.jpg`);
      assert.equal(metadata.twitter.images[0].url, metadata.openGraph.images[0].url);
      assert.equal(metadata.twitter.card, "summary_large_image");
      assert.equal(metadata.openGraph.title, metadata.title.absolute);
      assert.equal(metadata.openGraph.description, metadata.description);
    }
  }
});

test("development is excluded by default; indexing requires an explicit valid configuration", (t) => {
  environment(t, "https://stage.example.invalid", undefined);
  for (const value of [undefined, "false", "1", "TRUE"]) {
    if (value === undefined) delete process.env.SEO_INDEXABLE;
    else process.env.SEO_INDEXABLE = value;
    assert.deepEqual(getRootMetadata().robots, PRIVATE_ROBOTS);
    assert.deepEqual(getSitemap(), []);
    assert.deepEqual(getRobots(), { rules: { userAgent: "*", disallow: "/" } });
  }
});

test("the production sitemap contains only registered public pages and excludes credentials/private routes", (t) => {
  environment(t, "https://public.example.invalid", "true");
  assert.equal(getRootMetadata().robots.index, true);
  assert.deepEqual(
    getSitemap().map((item) => new URL(item.url).pathname),
    Object.keys(PUBLIC_PAGES)
  );
  const robots = getRobots();
  assert.equal(robots.sitemap, "https://public.example.invalid/sitemap.xml");
  for (const path of [
    "/api/",
    "/tasks",
    "/analytics",
    "/teams",
    "/settings",
    "/login",
    "/signup",
    "/mcp/authorize",
  ]) {
    assert.ok(robots.rules.disallow.includes(path));
    assert.ok(!getSitemap().some((item) => new URL(item.url).pathname === path));
  }
  assert.deepEqual(PRIVATE_ROBOTS, { index: false, follow: false });
});

test("missing and malformed origins never invent URLs or expose embedded credentials", (t) => {
  environment(t, undefined, "true");
  for (const origin of [
    undefined,
    "",
    "not a URL",
    "ftp://invalid.test",
    "https://user:secret@invalid.test",
    "https://invalid.test/path",
    "https://invalid.test?secret=token",
    "https://invalid.test#fragment",
  ]) {
    if (origin === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = origin;
    assert.equal(getSeoOrigin(), null);
    const metadata = getPublicMetadata("/");
    assert.equal(metadata.alternates, undefined);
    assert.equal(metadata.openGraph.url, undefined);
    assert.equal(metadata.openGraph.images, undefined);
    assert.equal(metadata.twitter.images, undefined);
    assert.equal(getRootMetadata().metadataBase, undefined);
    assert.deepEqual(getSitemap(), []);
    assert.equal(getWebsiteStructuredData(), null);
  }
});

test("structured data uses the configured site without invented ratings, prices or organizations", (t) => {
  environment(t, "https://public.example.invalid/", "true");
  const data = getWebsiteStructuredData();
  assert.equal(data["@type"], "WebSite");
  assert.equal(data.url, "https://public.example.invalid/");
  assert.equal(data.name, "Mokara");
  assert.equal(data.aggregateRating, undefined);
  assert.equal(data.offers, undefined);
});

test("every advertised icon and social image exists and PNG icons have their declared sizes", async () => {
  const root = new URL("../public/", import.meta.url);
  for (const [file, size] of [
    ["icons/icon-32.png", 32],
    ["icons/apple-touch-icon.png", 180],
  ]) {
    const bytes = await readFile(new URL(file, root));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const ico = await readFile(new URL("favicon.ico", root));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.ok((await stat(new URL("social/mokara-preview.jpg", root))).size > 1000);
});
