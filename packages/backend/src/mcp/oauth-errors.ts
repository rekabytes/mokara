import OAuth2Server from "@node-oauth/oauth2-server";
import type { Context } from "hono";
import { McpFailure } from "./errors.ts";
import { log } from "../lib/logger.ts";

export class McpOAuthFailure extends Error {
  constructor(
    readonly code:
      | "invalid_request"
      | "invalid_client"
      | "invalid_grant"
      | "invalid_scope"
      | "invalid_target"
      | "invalid_redirect_uri"
      | "unsupported_grant_type"
      | "invalid_client_metadata"
      | "access_denied",
    message = "The authorization request is invalid."
  ) {
    super(message);
  }
}
export function handleMcpOAuthError(error: Error, c: Context) {
  c.header("Cache-Control", "no-store");
  if (error instanceof McpOAuthFailure)
    return c.json(
      { error: error.code, error_description: error.message, message: error.message },
      400
    );
  if (error instanceof McpFailure) {
    if (error.status < 500 && error.status !== 429)
      return c.json(
        { error: "access_denied", error_description: error.message, message: error.message },
        400
      );
    if (error.retryAfter) c.header("Retry-After", String(error.retryAfter));
    return c.json(
      {
        error: error.status === 429 ? "temporarily_unavailable" : "server_error",
        error_description: error.message,
        message: error.message,
      },
      error.status === 429 ? 429 : 503
    );
  }
  if (error instanceof OAuth2Server.OAuthError && error.code >= 400 && error.code < 500) {
    const code = error.name;
    return c.json(
      {
        error: code,
        error_description: "Authorization failed. Start a new connection attempt.",
        message: "Authorization failed. Start a new connection attempt.",
      },
      400
    );
  }
  log.error("mcp oauth request failed");
  return c.json(
    {
      error: "server_error",
      error_description: "Authorization is temporarily unavailable.",
      message: "Authorization is temporarily unavailable.",
    },
    503
  );
}
