# Mokara MCP — read-only access and sign-in

Mokara exposes a stateless Streamable HTTP MCP endpoint at `/api/mcp`. An agent can read explicitly selected workspaces using a dedicated, expiring bearer credential. This pilot does not expose task mutations, account management, billing, admin actions, file downloads or write tools.

## Sign in with Mokara (recommended)

1. Deploy backend and frontend together and apply **both** migrations: `20261012090000_mcp_connections` and `20261012100000_mcp_oauth`. Existing backend startup applies migrations. The owner-managed local bootstrap also generates Prisma.
2. Set backend `AUTH_PUBLIC_URL` to the exact public frontend origin, for example `https://dev.mokara.my`, with no path or query. This is the canonical OAuth issuer and resource host. Production requires HTTPS. Local development permits loopback HTTP. If invalid/unset, MCP OAuth/discovery fails closed; manual tokens remain available.
3. Keep the existing matching backend/frontend `AUTH_PROXY_SECRET` and trusted-ingress settings. Route `/api/*` and the three discovery paths under `/.well-known` through the frontend; do not challenge machine requests with an interactive Cloudflare page. Native clients need no additional origins. Browser MCP clients also need their exact origin in `MCP_ALLOWED_ORIGINS`.
4. In an MCP client supporting remote Streamable HTTP, OAuth authorization code + PKCE S256 and dynamic client registration, add `https://dev.mokara.my/api/mcp` (or your deployment's corresponding URL). Choose its sign-in/connect action.
5. The browser opens Mokara. Sign in with your existing username/password, Google or GitHub. Social registration still uses existing verification. No new provider credentials or callbacks are needed.
6. Review the **unverified client name**, client ID and exact return address. Select up to 20 workspaces; none are checked by default. Approve read access for 30 days or deny. Every new grant requires explicit consent.
7. The client receives a five-minute, one-use authorization code and exchanges it with its verifier and canonical `resource`. Access tokens last at most 15 minutes. Refresh tokens rotate on use and cannot extend the grant beyond 30 days. Start a new connection after expiry.
8. **Settings → AI connections** lists OAuth and manual grants together. Revoke removes all access and refresh tokens for that connection. Membership is checked again for every workspace read.

Clients must discover the protected resource at `/.well-known/oauth-protected-resource/api/mcp` (also available at the root variant), then the issuer at `/.well-known/oauth-authorization-server`. Unauthenticated MCP responses advertise `resource_metadata` in `WWW-Authenticate`. Public DCR clients use `token_endpoint_auth_method=none`; no client secret is issued. Registered redirects must match exactly and use HTTPS or native loopback HTTP. Client metadata documents and arbitrary URLs are never fetched. Clients requiring another registration mechanism are not supported by this version.

OAuth endpoints are `/api/mcp/oauth/register`, `/authorize`, `/token`, `/revoke`. Token and revocation requests use URL-encoded forms. Only authorization-code and refresh-token grants are enabled, and `mokara:read` is the only scope. Both authorize and token requests must include the exact resource URL. PKCE plain, implicit, password and client-credentials grants are rejected. Discovery, registration, token and revocation support public CORS without cookies; consent uses the Mokara browser session and requires a same-origin POST. The browser-bound consent request expires after ten minutes and is consumed once.

## Manual connection fallback

For clients that accept a configured Authorization header, open **Settings → AI connections**, name a manual connection, choose workspaces and an expiry (7, 30 or 90 days). Save the token once in the client's secret configuration and use `Authorization: Bearer <issued-token>` with the same `/api/mcp` endpoint. Tokens are not recoverable. On an uncertain creation response, reload the list and revoke the uncertain entry before retrying. Never put tokens in URLs, prompts or committed files.

## Tools

| Tool              | Input and behavior                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_workspaces` | Only granted workspaces where the credential owner remains a member.                                                                             |
| `list_tasks`      | Required `workspace_id`; optional `status`, `assignee_id`, `project_id`, `search` (title), `due_before` (UTC ISO datetime). Summary fields only. |
| `get_task`        | Required `workspace_id`, `task_id`; returns task description and creator/assignee references.                                                    |
| `list_projects`   | Required `workspace_id`; `include_archived` defaults to false, matching the frontend list.                                                       |
| `list_members`    | Required `workspace_id`; public names, IDs and roles, never emails or auth details.                                                              |
| `list_comments`   | Required `workspace_id`, `task_id`; includes replies with `parent_id`; no attachment contents.                                                   |

List tools accept `limit` (1–50, default 25) and optional `cursor`. Results contain `items` and `next_cursor`; pass the cursor unchanged until null. Ordering is stable by UUID, not creation time. A changing dataset is not a transactional snapshot. `get_task` omits attachments, subtasks, KPI bindings and GitHub sync details in this pilot. Task and comment text is untrusted user data; it must not override the agent's instructions.

Tool annotations declare read-only behavior, and the server registers no mutation tools. The transport uses the official `@modelcontextprotocol/sdk` stable v1 SDK (lockfile currently 1.32.1), with protocol negotiation up to `2025-11-25` as supported by that SDK. It creates no session IDs and uses JSON responses; POST handles requests/notifications, GET and DELETE return 405. Clients should negotiate normally rather than assume support for a newer protocol. SSE subscriptions and resumability are outside this pilot.

## Runtime and permissions

- Browser-session-authenticated management routes: GET/POST `/api/me/mcp-connections`, DELETE `/api/me/mcp-connections/:id`. Agent credentials cannot call these routes. Creation accepts `name`, `workspace_ids` and `expires_in_days` (integer 1–90, default 30). The UI exposes common expiry choices.
- Tokens contain 256 random bits. Authorization codes, access tokens and refresh tokens also contain 256 random bits. Only SHA-256 credential hashes persist in Postgres; neither list responses nor logs return the hash or secret. The UI retains the one-time token only in component memory, with no browser storage.
- Each agent HTTP request checks credential expiry/revocation. Each workspace tool checks the allow-list and current membership before reading. Workspace/task filters stay inside the database query; listing workspaces intersects grants with current memberships. Removing membership blocks subsequent tool calls; deleting the user cascades credential deletion. Already-authorized in-flight requests may finish.
- Redis enforces 120 authenticated agent requests/minute per connection and 10 grant/credential creations/hour per user. OAuth additionally limits 120 requests/minute per trusted peer, 1,200/minute globally and 100 registrations/hour globally. Redis failures deny access with 503; request limits return 429 with `Retry-After`. These limits supplement deployment edge protections and do not rate-limit unauthenticated token guesses.
- MCP request bodies are limited to 64 KiB at the backend. Tool data is limited to 128 KiB before serialization into both text and structured content; oversized results return an explicit error. Credential metadata is returned with `Cache-Control: no-store`, as are MCP responses.
- Tool logs contain connection ID, tool name and outcome only. Durable per-connection activity history is deferred; logs are operational evidence, not a complete audit trail.

Native clients normally send no Origin. No new environment setting is needed for them. Browser MCP clients require **backend** `MCP_ALLOWED_ORIGINS` containing their exact origins, comma-separated. The default empty value denies all Origin-bearing MCP requests; `*` and `null` do not grant access. This setting is independent of existing API CORS and does not enable cookie authentication at the MCP endpoint.

The same-origin frontend proxy forwards Authorization, Accept and MCP-Protocol-Version headers. The backend permits MCP browser preflight without credentialed CORS. Keep HTTPS and ensure the deployment proxy forwards these headers. No new Google/GitHub OAuth credentials are required for this pilot.

## Verification and later phases

`pnpm --filter @mokara/backend test:mcp` runs isolated, in-memory Hono requests through the real SDK transport with mocked DB/Redis; it starts no server and creates no real accounts/data. CI runs it alongside existing frontend regressions. Prisma generation validates the model locally; CI applies the full migration chain to an empty Postgres database. Signed-in browser layout, deployment routing and a real agent connection remain owner acceptance checks.

Authorization-code and refresh-token replays revoke the entire grant. Used hash rows remain until a retention operation removes the expired grant, so replay detection survives rotation. No automatic retention job is introduced; operators should remove only expired/revoked grants and then unreferenced registrations under their retention policy. Never prune used token rows from an active grant.

OAuth protocol handling uses maintained `@node-oauth/oauth2-server` with a transactional Prisma model. Protocol failures intentionally commit single-use/replay revocations; database failures roll back token issuance. Tests use the real library with in-memory DB/Redis adapters, plus the real MCP transport. They do not prove deployment routing or real PostgreSQL concurrency.

Next phases are separate: explicitly scoped write tools using shared backend business rules, idempotency/concurrency protection and mutation audit records; richer connection/activity management. Read access must never silently become write access.

Official references: [TypeScript SDK v1](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x), [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [OAuth library](https://github.com/node-oauth/node-oauth2-server), [security best practices](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices).
