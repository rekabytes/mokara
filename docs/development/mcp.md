# Mokara MCP — scoped task workflows and sign-in

Mokara exposes a stateless Streamable HTTP MCP endpoint at `/api/mcp`. An agent can use approved read/write tools in explicitly selected workspaces using a dedicated, expiring bearer credential. The server exposes approved task workflows; account credentials, billing and admin operations are excluded.

## Agent task execution

The additive agent execution contract adds 19 tools (66 total across all scopes).
See [the public client integration guide](../../packages/frontend/public/docs/agent-execution.md)
for actual tool names, payloads, permissions, transitions and recovery rules, and
[implementation and QA notes](agent-execution.md) for database ownership and checks.
Existing grants do not receive `mokara:agent:manage` or `mokara:agent:execute`.
Ordinary task-write permission cannot authorize or execute agent work.

Lifecycle mutations use a separate **transactional** request ledger, not the
ordinary pending-operation ledger described below. Exact request UUID/payload
retries replay their original result. Read current execution state before relying
on a historical success. Agent tool retries still pass the existing write limiter;
use backoff and stop external work if a live lease cannot be maintained.

## Write permissions and tools

Migration `20261013100000_mcp_write_permissions` adds connection/token scopes, repository allow-lists and durable request records. Deploy frontend/backend together and apply all MCP migrations. Existing connections and token rows receive only `mokara:read`; they never silently gain writes. New OAuth grants and manual credentials default to read. Consent displays only scopes actually requested by the client, with write/delete/GitHub unchecked. GitHub permission follows the user's active repositories, including repositories they activate later. Users manage that list in GitHub settings.

| Scope           | Tools / behavior                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mokara:read`   | Original six tools; complete task details, project details, KPI lists/progress, analytics, workspace progress, attachment metadata/content and this connection's operation activity.    |
| `mokara:write`  | Create/edit tasks, steps, comments, projects, KPIs; set task KPI bindings, reorder steps, toggle flags, upload attachments.                                                             |
| `mokara:delete` | Delete tasks, steps, own comments, eligible projects/KPIs and own attachments. Separate permission with explicit confirm input.                                                         |
| `mokara:github` | Active repository listing, issue listing/details, publishing, linking an existing issue and retrying sync. Current enabled repository access and GitHub verification are checked again. |

MCP invokes the existing Hono domain operations **in-process**, with the verified principal's current user identity. There is no loopback HTTP request, browser cookie, fabricated session, generic REST tool or arbitrary path/URL argument. Existing ownership rules, validation, quotas, notifications, SSE and GitHub outbox behavior remain authoritative. Status changes on tasks with linked GitHub issues additionally require the connection's GitHub repository permission, because they can trigger external synchronization. Linking an existing issue rejects pull requests and enables existing synchronization; the user must explicitly request it. A partial unique index prevents one GitHub issue from being actively synchronized by multiple tasks. GitHub publication claims the task/link under a row lock before external requests, so competing publishers cannot overwrite its target repository.

Every mutation requires a `request_id` UUID. For ordinary task/GitHub/mDrive writes, the operation ledger has a unique `(connection_id, request_id)` key and a canonical argument hash. Matching completed requests replay their result; changed arguments conflict; matching in-flight/uncertain requests never execute again. Current scopes/membership are enforced before returning a stored result. The ledger reserves before side effects and writes a final result afterwards. A crash or failure after a domain write may leave `pending`: this is deliberately **uncertain**, not a claim that the operation did nothing. Inspect the task/activity before a new action. Existing domain handlers do not share a single transaction with the ledger, so this is duplicate prevention with explicit uncertainty, not a claim of distributed exactly-once delivery. Known failures before/within domain checks are recorded; unexpected failures remain pending. Creation can succeed while steps or GitHub publication fail; the result includes task ID and follow-up errors, and retries of that request never recreate the task.

Redis limits new write requests to30/minute/user in addition to120 MCP requests/minute/connection. Replay of completed operations does not consume the write quota. MCP bodies are bounded at2MiB, uploads at1MiB decoded plus existing storage/file quotas, and tool data at128KiB. Attachment reads use storage byte ranges and64KiB chunks, returning `next_offset`; storage credentials and keys are never returned. Oversized results are explicit errors. Operation results may contain authorized workspace data; activity list endpoints expose only safe metadata. No automated ledger retention is introduced; deleting a grant cascades its operation records. Keep replay records while a grant is active.

## Sign in with Mokara (recommended)

1. Deploy backend and frontend together and apply **both** migrations: `20261012090000_mcp_connections` and `20261012100000_mcp_oauth`. Existing backend startup applies migrations. The owner-managed local bootstrap also generates Prisma.
2. Set backend `AUTH_PUBLIC_URL` to the exact public frontend origin, for example `https://dev.mokara.my`, with no path or query. This is the canonical OAuth issuer and resource host. Production requires HTTPS. Local development permits loopback HTTP. If invalid/unset, MCP OAuth/discovery fails closed; manual tokens remain available.
3. Keep the existing matching backend/frontend `AUTH_PROXY_SECRET` and trusted-ingress settings. Route `/api/*` and the three discovery paths under `/.well-known` through the frontend; do not challenge machine requests with an interactive Cloudflare page. Native clients need no additional origins. Browser MCP clients also need their exact origin in `MCP_ALLOWED_ORIGINS`.
4. In an MCP client supporting remote Streamable HTTP, OAuth authorization code + PKCE S256 and dynamic client registration, use the endpoint displayed by this instance’s `/docs/mcp` page, obtained from backend discovery. Choose its sign-in/connect action.
5. The browser opens Mokara. Sign in with your existing username/password, Google or GitHub. Social registration still uses existing verification. No new provider credentials or callbacks are needed.
6. Review the **unverified client name**, client ID and exact return address. Select up to 20 workspaces; none are checked by default. Choose permissions, then approve access for30 days or deny. Every new grant requires explicit consent.
7. The client receives a five-minute, one-use authorization code and exchanges it with its verifier and canonical `resource`. Access tokens last at most 15 minutes. Refresh tokens rotate on use and cannot extend the grant beyond 30 days. Start a new connection after expiry.
8. **Settings → AI connections** lists OAuth and manual grants together. Revoke removes all access and refresh tokens for that connection. Membership is checked again for every workspace read.

Clients must discover the protected resource at `/.well-known/oauth-protected-resource/api/mcp` (also available at the root variant), then the issuer at `/.well-known/oauth-authorization-server`. Unauthenticated MCP responses advertise `resource_metadata` in `WWW-Authenticate`. Public DCR clients use `token_endpoint_auth_method=none`; no client secret is issued. Registered redirects must match exactly and use HTTPS or native loopback HTTP. Client metadata documents and arbitrary URLs are never fetched. Clients requiring another registration mechanism are not supported by this version.

OAuth endpoints are `/api/mcp/oauth/register`, `/authorize`, `/token`, `/revoke`. Token and revocation requests use URL-encoded forms. Only authorization-code and refresh-token grants are enabled; supported permission scopes are listed above. Refresh can narrow scopes but cannot expand an issued token. Both authorize and token requests must include the exact resource URL. PKCE plain, implicit, password and client-credentials grants are rejected. Discovery, registration, token and revocation support public CORS without cookies; consent uses the Mokara browser session and requires a same-origin POST. The browser-bound consent request expires after ten minutes and is consumed once.

## Active GitHub repositories

Mokara checks the user's active GitHub repositories on every repository request.
Activate or deactivate a repository in Settings and the next request uses the
updated list. Existing GitHub-enabled connections use this list too. Workspace
grants and scopes stay fixed. A connection needs `mokara:github` to access any
repository.

Mokara keeps old `mcp_connections.repository_ids` values for rollback, but no
longer uses them to decide access. New connections leave that column empty.
Older clients can still send `repository_ids`. Mokara validates their format,
but the IDs do not grant or restrict access. Nonempty IDs still require GitHub
permission. Connection metadata returns `repository_access: active | none` and
an empty `repository_ids` array. No migration or new environment setting is needed.

A repository must be enabled for the user, belong to an active installation and
have a verified GitHub connection. Mokara normally refreshes GitHub verification
after five minutes. Changes made on GitHub may take effect after that check or a
webhook update. Remembering a repository ID does not give an agent access to it.

Registration accepts `application_type: native` and `application_type: web`.
Codex's rmcp client sends the native value. Mokara validates the field without
changing its HTTPS or loopback redirect rules, exact callback matching, PKCE S256,
resource binding or scope checks. Mokara still rejects unknown application types,
client credentials and unsupported grants.

Accepting this field fixes the reproduced 400 error before consent. Real sign-in
on the deployed app still needs testing. See the
[rmcp registration code](https://github.com/modelcontextprotocol/rust-sdk/blob/main/crates/rmcp/src/transport/auth.rs)
and [Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp).
Mokara advertises dynamic client registration. It does not support client metadata
documents.

## Manual connection fallback

For clients that accept a configured Authorization header, open **Settings → AI connections**, name a manual connection, choose workspaces, permissions and an expiry (7, 30 or 90 days). Save the token once in the client's secret configuration and use `Authorization: Bearer <issued-token>` with the same `/api/mcp` endpoint. Tokens are not recoverable. On an uncertain creation response, reload the list and revoke the uncertain entry before retrying. Never put tokens in URLs, prompts or committed files.

## Tools

| Tool              | Input and behavior                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_workspaces` | Only granted workspaces where the credential owner remains a member.                                                                             |
| `list_tasks`      | Required `workspace_id`; optional `status`, `assignee_id`, `project_id`, `search` (title), `due_before` (UTC ISO datetime). Summary fields only. |
| `get_task`        | Required `workspace_id`, `task_id`; returns task description and creator/assignee references.                                                    |
| `list_projects`   | Required `workspace_id`; `include_archived` defaults to false, matching the frontend list.                                                       |
| `list_members`    | Required `workspace_id`; public names, IDs and roles, never emails or auth details.                                                              |
| `list_comments`   | Required `workspace_id`, `task_id`; includes replies with `parent_id`; no attachment contents.                                                   |

The original task list tools accept `limit` (1–50, default 25) and optional `cursor`. Results contain `items` and `next_cursor`; pass the cursor unchanged until null. Ordering is stable by UUID, not creation time. A changing dataset is not a transactional snapshot. `get_task` is the original summary/detail response; use `get_task_details` for steps, KPI bindings, GitHub sync details and attachment metadata. Task and comment text is untrusted user data; it must not override the agent's instructions.

Tools are registered according to the authenticated token’s scopes. Read/write, destructive and external annotations describe behavior; backend permission checks enforce it. The transport uses the official `@modelcontextprotocol/sdk` stable v1 SDK (lockfile currently 1.32.1), with protocol negotiation up to `2025-11-25` as supported by that SDK. It creates no session IDs and uses JSON responses; POST handles requests/notifications, GET and DELETE return 405. Clients should negotiate normally rather than assume support for a newer protocol. SSE subscriptions and resumability are outside this pilot.

## Runtime and permissions

- Browser-session-authenticated management routes: GET/POST `/api/me/mcp-connections`, DELETE `/api/me/mcp-connections/:id`. Agent credentials cannot call these routes. Creation accepts `name`, `workspace_ids`, `scopes` and `expires_in_days` (integer 1–90, default 30). The UI exposes common expiry choices.
- Tokens contain 256 random bits. Authorization codes, access tokens and refresh tokens also contain 256 random bits. Only SHA-256 credential hashes persist in Postgres; neither list responses nor logs return the hash or secret. The UI retains the one-time token only in component memory, with no browser storage.
- Each agent HTTP request checks credential expiry/revocation. Each workspace tool checks the allow-list and current membership before reading. Workspace/task filters stay inside the database query; listing workspaces intersects grants with current memberships. Removing membership blocks subsequent tool calls; deleting the user cascades credential deletion. Already-authorized in-flight requests may finish.
- Redis enforces 120 authenticated agent requests/minute per connection, 30 new mutations/minute per user and 10 grant/credential creations/hour per user. OAuth additionally limits 120 requests/minute per trusted peer, 1,200/minute globally and 100 registrations/hour globally. Redis failures deny access with 503; request limits return 429 with `Retry-After`. These limits supplement deployment edge protections and do not rate-limit unauthenticated token guesses.
- MCP request bodies are limited to 2 MiB at the backend. Tool data is limited to 128 KiB before serialization into both text and structured content; oversized results return an explicit error. Credential metadata is returned with `Cache-Control: no-store`, as are MCP responses.
- Tool logs contain tool name and outcome only; private connection IDs and request contents are omitted. The durable operation ledger records write outcomes and uncertainty; Settings shows recent activity. Logs remain operational evidence, not a complete audit trail.

Native clients normally send no Origin. No new environment setting is needed for them. Browser MCP clients require **backend** `MCP_ALLOWED_ORIGINS` containing their exact origins, comma-separated. The default empty value denies all Origin-bearing MCP requests; `*` and `null` do not grant access. This setting is independent of existing API CORS and does not enable cookie authentication at the MCP endpoint.

The same-origin frontend proxy forwards Authorization, Accept and MCP-Protocol-Version headers. The backend permits MCP browser preflight without credentialed CORS. Keep HTTPS and ensure the deployment proxy forwards these headers. No new Google/GitHub OAuth credentials are required for this pilot.

## Verification and later phases

`pnpm --filter @mokara/backend test:mcp` runs isolated, in-memory Hono requests through the real SDK transport with mocked DB/Redis; it starts no server and creates no real accounts/data. CI runs it alongside existing frontend regressions. Prisma generation validates the model locally; CI applies the full migration chain to an empty Postgres database. Signed-in browser layout, deployment routing and a real agent connection remain owner acceptance checks.

Authorization-code and refresh-token replays revoke the entire grant. Used hash rows remain until a retention operation removes the expired grant, so replay detection survives rotation. No automatic retention job is introduced; operators should remove only expired/revoked grants and then unreferenced registrations under their retention policy. Never prune used token rows from an active grant.

OAuth protocol handling uses maintained `@node-oauth/oauth2-server` with a transactional Prisma model. Protocol failures intentionally commit single-use/replay revocations; database failures roll back token issuance. Tests use the real library with in-memory DB/Redis adapters, plus the real MCP transport. They do not prove deployment routing or real PostgreSQL concurrency.

Future work may extend workflow coverage and activity management. Read access must never silently become write access.

Official references: [TypeScript SDK v1](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x), [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [OAuth library](https://github.com/node-oauth/node-oauth2-server), [security best practices](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices).

## Workflow guidance and downloadable skill

Server instructions distinguish workspace/project/repository destinations, explicit publishing intent and ambiguity before mutation. `create_task.github_repository_id` describes the combined new-task/issue flow. Creation returns `completion`, `github_issue`, `next_action` and existing `follow_up_errors`; partial failures preserve the task and do not claim successful publication. Task deep links are not fabricated: the current client has no supported task-detail URL route, so results identify the task by ID and return provider issue URLs.

Scope-filtered MCP prompts `create_task_with_github_issue` (write + GitHub) and `publish_existing_task_to_github` (GitHub) render guidance and user-supplied arguments without executing tools. Prompts are optional client-selected templates; client support varies. Public `/docs/mcp` links the versioned, self-contained `/skills/mokara/SKILL.md` asset; users install it through their client's skill mechanism. Connecting MCP alone does not load it. No secrets, fixed resource IDs, service URLs or permission bypasses are embedded. Protocol regressions verify filtering, side-effect-free prompt rendering, combined publication outcomes, local-only creation and existing-task publishing. These tests do not evaluate a live model's tool selection; smaller-model acceptance remains a manual agent check.

The public guide renders `npx skills@latest add <runtime-skill-url> --skill mokara --agent universal --yes`. The source URL is shell-quoted and derived from the same validated backend public endpoint origin, not frontend Host headers or a hardcoded domain. The hosted SKILL.md is the installation source, so no npm package publishing or public repository access is needed. Universal project scope targets `.agents/skills/mokara/SKILL.md`; other agent targets can use their own directories. Absent discovery metadata hides the command instead of guessing a URL. CLI behavior was verified against the official vercel-labs/skills source/docs; no installer was run against a live Mokara deployment.
