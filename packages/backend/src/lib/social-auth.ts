import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { env } from "../env.ts";
import { getRedis } from "../redis.ts";

export const SocialProviderSchema = z.enum(["google", "github"]);
export type SocialProvider = z.infer<typeof SocialProviderSchema>;
export const SOCIAL_TTL = 600;
export const randomToken = () => randomBytes(32).toString("base64url");
export const tokenDigest = (value: string) => createHash("sha256").update(value).digest("hex");

export class SocialAuthError extends Error {
  constructor(
    public readonly code:
      | "social_expired"
      | "social_cancelled"
      | "social_failed"
      | "social_unavailable"
      | "social_identity_in_use"
      | "social_session_changed"
  ) {
    super(code);
  }
}

export function socialOrigin(): string | null {
  try {
    const url = new URL(env.AUTH_PUBLIC_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (url.protocol !== "https:" && !(env.ENV !== "production" && url.protocol === "http:"))
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function socialProviderConfig(provider: SocialProvider) {
  const origin = socialOrigin();
  const clientId = provider === "google" ? env.GOOGLE_AUTH_CLIENT_ID : env.GITHUB_AUTH_CLIENT_ID;
  const clientSecret =
    provider === "google" ? env.GOOGLE_AUTH_CLIENT_SECRET : env.GITHUB_AUTH_CLIENT_SECRET;
  return {
    enabled: Boolean(origin && clientId && clientSecret),
    clientId,
    clientSecret,
    callback: `${origin}/api/auth/social/${provider}/callback`,
  };
}

// Only signed-in client routes may be returned to, never arbitrary URLs or API
// endpoints. Query strings are retained for existing task filters/invitations.
export function socialReturnPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\\\r\n]/.test(raw)) return "/tasks";
  const url = new URL(raw, "https://mokara.invalid");
  if (
    url.origin !== "https://mokara.invalid" ||
    !/^\/(tasks|analytics|teams|settings|invitations)(\/|$)/.test(url.pathname)
  )
    return "/tasks";
  return `${url.pathname}${url.search}`;
}

const FlowSchema = z.object({
  provider: SocialProviderSchema,
  browserDigest: z.string(),
  verifier: z.string(),
  nonce: z.string(),
  from: z.string(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
});
export type SocialFlow = z.infer<typeof FlowSchema>;
export const SocialProfileSchema = z.object({
  provider: SocialProviderSchema,
  subject: z.string().min(1).max(255),
  email: z.string().email().max(320),
  name: z.string().max(200),
});
export type SocialProfile = z.infer<typeof SocialProfileSchema>;
export const PendingSocialSchema = z.object({ profile: SocialProfileSchema, from: z.string() });
export type PendingSocial = z.infer<typeof PendingSocialSchema>;

export async function createSocialFlow(
  provider: SocialProvider,
  browser: string,
  from: string,
  link?: { userId: string; sessionId: string }
) {
  const state = randomToken();
  const flow: SocialFlow = {
    provider,
    browserDigest: tokenDigest(browser),
    verifier: randomToken(),
    nonce: randomToken(),
    from: socialReturnPath(from),
    ...link,
  };
  const stored = await getRedis().set(
    `mokara:social:state:${tokenDigest(state)}`,
    JSON.stringify(flow),
    "EX",
    SOCIAL_TTL,
    "NX"
  );
  if (stored !== "OK") throw new SocialAuthError("social_unavailable");
  return { state, flow };
}

export async function consumeSocialFlow(
  state: string,
  browser: string | undefined,
  provider: SocialProvider
): Promise<SocialFlow> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !browser) throw new SocialAuthError("social_expired");
  const raw = await getRedis().getdel(`mokara:social:state:${tokenDigest(state)}`);
  if (!raw) throw new SocialAuthError("social_expired");
  const parsed = FlowSchema.safeParse(JSON.parse(raw));
  if (
    !parsed.success ||
    parsed.data.provider !== provider ||
    parsed.data.browserDigest !== tokenDigest(browser)
  )
    throw new SocialAuthError("social_expired");
  return parsed.data;
}

export function socialAuthorizeUrl(
  provider: SocialProvider,
  state: string,
  flow: SocialFlow
): string {
  const config = socialProviderConfig(provider);
  if (!config.enabled) throw new SocialAuthError("social_unavailable");
  const url = new URL(
    provider === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://github.com/login/oauth/authorize"
  );
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callback,
    response_type: "code",
    state,
    scope: provider === "google" ? "openid email profile" : "read:user user:email",
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...(provider === "google" ? { nonce: flow.nonce, prompt: "select_account" } : {}),
  }).toString();
  return url.toString();
}

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), {
  timeoutDuration: 5000,
});
export async function verifyGoogleIdentity(
  idToken: string,
  clientId: string,
  nonce: string,
  keys: JWTVerifyGetKey = googleKeys
): Promise<SocialProfile> {
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat", "nonce"],
    maxTokenAge: "10m",
  });
  const claims = z
    .object({
      sub: z.string().min(1).max(255),
      nonce: z.literal(nonce),
      email: z.string().email(),
      email_verified: z.literal(true),
      name: z.string().max(200).optional(),
      azp: z.string().optional(),
    })
    .parse(payload);
  if (
    (claims.azp && claims.azp !== clientId) ||
    (Array.isArray(payload.aud) && payload.aud.length > 1 && claims.azp !== clientId)
  )
    throw new SocialAuthError("social_failed");
  return SocialProfileSchema.parse({
    provider: "google",
    subject: claims.sub,
    email: claims.email,
    name: claims.name ?? "",
  });
}

async function providerJson(url: string, init: RequestInit, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    ...init,
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });
  if (!response.ok) throw new SocialAuthError("social_unavailable");
  return response.json();
}

export async function exchangeSocialIdentity(
  provider: SocialProvider,
  code: string,
  flow: SocialFlow,
  fetcher: typeof fetch = fetch
): Promise<SocialProfile> {
  const config = socialProviderConfig(provider);
  if (!config.enabled) throw new SocialAuthError("social_unavailable");
  const token = await providerJson(
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callback,
        code,
        code_verifier: flow.verifier,
        grant_type: "authorization_code",
      }),
    },
    fetcher
  );
  if (provider === "google")
    return verifyGoogleIdentity(
      z.object({ id_token: z.string().max(16000) }).parse(token).id_token,
      config.clientId,
      flow.nonce
    );
  const credentials = z
    .object({ access_token: z.string().min(1).max(4096), token_type: z.string() })
    .parse(token);
  if (credentials.token_type.toLowerCase() !== "bearer") throw new SocialAuthError("social_failed");
  const headers = {
    authorization: `Bearer ${credentials.access_token}`,
    accept: "application/vnd.github+json",
    "user-agent": "Mokara-sign-in",
    "x-github-api-version": "2022-11-28",
  };
  const user = z
    .object({
      id: z.number().int().positive().safe(),
      login: z.string(),
      name: z.string().nullable().optional(),
    })
    .parse(await providerJson("https://api.github.com/user", { headers }, fetcher));
  const emails = z
    .array(z.object({ email: z.string().email(), verified: z.boolean(), primary: z.boolean() }))
    .parse(await providerJson("https://api.github.com/user/emails", { headers }, fetcher));
  const email =
    emails.find((item) => item.verified && item.primary) ?? emails.find((item) => item.verified);
  if (!email) throw new SocialAuthError("social_failed");
  return SocialProfileSchema.parse({
    provider: "github",
    subject: String(user.id),
    email: email.email,
    name: user.name ?? user.login,
  });
}
