import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { z } from "zod";
import { mcpOAuthAuthorizeSchema as flowSchema } from "../lib/validation.ts";
import { env } from "../env.ts";
import { getRedis } from "../redis.ts";
import { hashCredential } from "./access.ts";
import { oauthSecret } from "./oauth-model.ts";
import { McpOAuthFailure } from "./oauth-errors.ts";

const cookieName = env.ENV === "production" ? "__Host-mokara_mcp_consent" : "mokara_mcp_consent";
const storedSchema = z.object({
  params: flowSchema,
  browserHash: z.string(),
  clientName: z.string(),
});
export type McpOAuthFlow = z.infer<typeof storedSchema>;
export async function storeConsent(
  c: Context,
  params: z.infer<typeof flowSchema>,
  clientName: string
) {
  const existing = getCookie(c, cookieName);
  const browser = existing && /^[A-Za-z0-9_-]{43}$/.test(existing) ? existing : oauthSecret("");
  const request = oauthSecret("");
  const flow: McpOAuthFlow = { params, clientName, browserHash: hashCredential(browser) };
  await getRedis().set(`mcp:consent:${hashCredential(request)}`, JSON.stringify(flow), "EX", 600);
  setCookie(c, cookieName, browser, {
    httpOnly: true,
    secure: env.ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  return request;
}
export async function readConsent(c: Context, request: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(request))
    throw new McpOAuthFailure(
      "invalid_request",
      "Connection request expired. Start again from your agent."
    );
  const raw = await getRedis().get(`mcp:consent:${hashCredential(request)}`);
  const flow = storedSchema.safeParse(raw ? JSON.parse(raw) : null);
  const cookie = getCookie(c, cookieName);
  if (!flow.success || !cookie || flow.data.browserHash !== hashCredential(cookie))
    throw new McpOAuthFailure(
      "invalid_request",
      "Connection request expired or belongs to another browser. Start again from your agent."
    );
  return { flow: flow.data, raw };
}
const CONSUME_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1
`;
export async function consumeConsent(request: string, raw: string | null) {
  if (
    !raw ||
    (await getRedis().eval(CONSUME_SCRIPT, 1, `mcp:consent:${hashCredential(request)}`, raw)) !== 1
  )
    throw new McpOAuthFailure(
      "invalid_request",
      "Connection request already completed. Start again from your agent."
    );
}
