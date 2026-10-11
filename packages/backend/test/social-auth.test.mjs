import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
const env = {
  ENV: "development",
  AUTH_PUBLIC_URL: "http://localhost:4701",
  GOOGLE_AUTH_CLIENT_ID: "google-client",
  GOOGLE_AUTH_CLIENT_SECRET: "google-secret",
  GITHUB_AUTH_CLIENT_ID: "github-client",
  GITHUB_AUTH_CLIENT_SECRET: "github-secret",
};
const data = new Map();
const redis = {
  set: async (key, value, _ex, ttl, nx) => {
    assert.equal(ttl, 600);
    assert.equal(nx, "NX");
    if (data.has(key)) return null;
    data.set(key, value);
    return "OK";
  },
  getdel: async (key) => {
    const value = data.get(key);
    data.delete(key);
    return value ?? null;
  },
};
mock.module("../src/env.ts", { namedExports: { env } });
mock.module("../src/redis.ts", { namedExports: { getRedis: () => redis } });
const social = await import("../src/lib/social-auth.ts");
beforeEach(() => {
  data.clear();
  env.ENV = "development";
  env.AUTH_PUBLIC_URL = "http://localhost:4701";
});
test("provider configuration rejects insecure production origins and URL components", () => {
  assert.equal(social.socialProviderConfig("google").enabled, true);
  env.ENV = "production";
  assert.equal(social.socialOrigin(), null);
  for (const url of [
    "https://mokara.example/path",
    "https://user:pass@mokara.example",
    "https://mokara.example?x=1",
    "https://mokara.example/#x",
    "javascript:alert(1)",
  ]) {
    env.AUTH_PUBLIC_URL = url;
    assert.equal(social.socialOrigin(), null);
  }
  env.AUTH_PUBLIC_URL = "https://mokara.example";
  assert.equal(
    social.socialProviderConfig("github").callback,
    "https://mokara.example/api/auth/social/github/callback"
  );
});
test("return paths reject external, API and encoded traversal", () => {
  assert.equal(social.socialReturnPath("/tasks?project=one"), "/tasks?project=one");
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/api/auth/logout",
    "/tasks/../api/auth/logout",
    "/tasks/%2e%2e/api/auth/logout",
    "/login",
    "/tasks\nLocation:evil",
  ])
    assert.equal(social.socialReturnPath(path), "/tasks");
});
test("state has bounded lifetime, hashed storage, browser binding and one-time consumption", async () => {
  const browser = social.randomToken();
  const { state, flow } = await social.createSocialFlow("google", browser, "/teams", {
    userId: "u1",
    sessionId: "s1",
  });
  assert.equal(state.length, 43);
  assert.equal(data.has(`mokara:social:state:${state}`), false);
  assert.equal(flow.browserDigest, social.tokenDigest(browser));
  assert.equal((await social.consumeSocialFlow(state, browser, "google")).sessionId, "s1");
  await assert.rejects(() => social.consumeSocialFlow(state, browser, "google"), {
    code: "social_expired",
  });
});
test("wrong browser/provider, missing cookie and expired state fail closed", async () => {
  for (const [browser, provider] of [
    ["wrong-browser", "google"],
    ["browser", "github"],
    [undefined, "google"],
  ]) {
    const { state } = await social.createSocialFlow("google", "browser", "/tasks");
    await assert.rejects(() => social.consumeSocialFlow(state, browser, provider), {
      code: "social_expired",
    });
  }
  await assert.rejects(() => social.consumeSocialFlow(social.randomToken(), "browser", "google"), {
    code: "social_expired",
  });
});
test("authorization uses PKCE, fixed callbacks, Google nonce and no client secret", async () => {
  for (const provider of ["google", "github"]) {
    const { state, flow } = await social.createSocialFlow(provider, "browser", "/tasks");
    const url = new URL(social.socialAuthorizeUrl(provider, state, flow));
    assert.equal(url.searchParams.get("state"), state);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(
      url.searchParams.get("code_challenge"),
      createHash("sha256").update(flow.verifier).digest("base64url")
    );
    assert.equal(
      url.searchParams.get("redirect_uri"),
      `http://localhost:4701/api/auth/social/${provider}/callback`
    );
    assert.equal(url.searchParams.has("client_secret"), false);
    if (provider === "google") assert.equal(url.searchParams.get("nonce"), flow.nonce);
  }
});
const { privateKey, publicKey } = await generateKeyPair("RS256");
const keys = async () => publicKey;
const makeToken = (claims = {}, options = {}) =>
  new SignJWT({
    nonce: "nonce",
    email: "person@example.com",
    email_verified: true,
    name: "Person",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("stable-google-id")
    .setIssuer(options.issuer ?? "https://accounts.google.com")
    .setAudience(options.audience ?? "google-client")
    .setIssuedAt()
    .setExpirationTime(options.expiry ?? "5m")
    .sign(privateKey);
test("Google verifies signature and returns stable subject", async () => {
  const token = await makeToken();
  assert.deepEqual(await social.verifyGoogleIdentity(token, "google-client", "nonce", keys), {
    provider: "google",
    subject: "stable-google-id",
    email: "person@example.com",
    name: "Person",
  });
  const other = await generateKeyPair("RS256");
  await assert.rejects(() =>
    social.verifyGoogleIdentity(token, "google-client", "nonce", async () => other.publicKey)
  );
});
test("Google rejects wrong issuer/audience/nonce, unverified email, expiry and authorized party", async () => {
  for (const [claims, options] of [
    [{}, { issuer: "https://evil.example" }],
    [{}, { audience: "other-client" }],
    [{ nonce: "wrong" }, {}],
    [{ email_verified: false }, {}],
    [{}, { expiry: "-1m" }],
    [{ azp: "other-client" }, {}],
    [{}, { audience: ["google-client", "other-client"] }],
  ]) {
    const token = await makeToken(claims, options);
    await assert.rejects(() => social.verifyGoogleIdentity(token, "google-client", "nonce", keys));
  }
});
test("GitHub exchanges PKCE server-side, uses numeric ID and requires verified email", async () => {
  const { flow } = await social.createSocialFlow("github", "browser", "/tasks");
  const fakeFetch = async (url, init) => {
    assert.equal(init.redirect, "error");
    assert.ok(init.signal);
    if (url.endsWith("access_token")) {
      assert.equal(init.body.get("code_verifier"), flow.verifier);
      assert.equal(init.body.get("client_secret"), "github-secret");
      return Response.json({ access_token: "temporary", token_type: "bearer" });
    }
    assert.equal(init.headers.authorization, "Bearer temporary");
    return Response.json(
      url.endsWith("/emails")
        ? [
            { email: "bad@example.com", primary: true, verified: false },
            { email: "good@example.com", primary: false, verified: true },
          ]
        : { id: 1234, login: "changeable-handle", name: null }
    );
  };
  assert.deepEqual(await social.exchangeSocialIdentity("github", "code", flow, fakeFetch), {
    provider: "github",
    subject: "1234",
    email: "good@example.com",
    name: "changeable-handle",
  });
  const unverified = async (url) =>
    Response.json(
      url.endsWith("access_token")
        ? { access_token: "temporary", token_type: "bearer" }
        : url.endsWith("/emails")
          ? [{ email: "bad@example.com", verified: false, primary: true }]
          : { id: 1, login: "user" }
    );
  await assert.rejects(() => social.exchangeSocialIdentity("github", "code", flow, unverified), {
    code: "social_failed",
  });
  await assert.rejects(
    () =>
      social.exchangeSocialIdentity(
        "github",
        "code",
        flow,
        async () => new Response(null, { status: 503 })
      ),
    { code: "social_unavailable" }
  );
});
