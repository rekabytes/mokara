# GitHub Integration — Per-user connections and task-to-issue publishing

> **Status: IMPLEMENTED IN CODE — pending a live GitHub App acceptance pass.**
>
> This document plans a GitHub integration in which every Mokara user may
> connect their own GitHub account and repositories. It does not make the
> workspace leader the credential owner, and it does not give teammates silent
> access to another member's GitHub installation.

## 1. Product decision

The first release is deliberately narrow:

- GitHub is connected **per Mokara user**, from personal settings.
- One user may have access to multiple GitHub App installations and repositories
  (personal accounts and organizations).
- Creating a GitHub issue is **optional per task**.
- A user may publish only through a repository that their own verified GitHub
  connection can access.
- A Mokara task may link to at most one GitHub issue in v1.
- Publishing is **create-and-link only**. Later Mokara edits do not update the
  issue, and GitHub edits do not update the task.
- A failed GitHub request never rolls back or deletes the Mokara task.
- Repository sharing with a whole workspace, automatic publishing, comments,
  attachment transfer, and two-way synchronization are later phases.

This gives every member the requested personal connection without turning one
member's GitHub credentials into an implicit workspace credential.

## 2. Why a GitHub App

Use a GitHub App rather than classic OAuth scopes or personal access tokens.

The app requests only:

| GitHub permission   | Level          | Purpose                                             |
| ------------------- | -------------- | --------------------------------------------------- |
| Repository metadata | Read           | Identify selected repositories and detect renames   |
| Issues              | Read and write | Find an existing Mokara marker and create the issue |

No Contents, Actions, Administration, Members, or organization-wide write
permission is needed. The user or organization chooses which repositories the
installation can access.

The backend authenticates as the GitHub App, exchanges an installation ID for a
short-lived installation access token, and uses that token for issue calls. It
must not store an installation token. The app private key and OAuth client
secret stay in backend environment variables.

A short-lived GitHub user authorization is still needed during connection. It
proves which GitHub user is completing the Mokara flow and lets the backend
verify that the user can access the claimed installation. It is discarded after
verification; it is not the credential used to create issues.

## 3. Current Mokara constraints

The implementation must preserve these existing contracts:

- Browser API traffic is same-origin through `packages/frontend/app/api/[...path]/route.ts`.
- Product authentication is the existing httpOnly session cookie.
- Redis is available and fail-closed; it is suitable for short-lived OAuth
  state and temporary connection data.
- Backend request input uses strict Zod validation.
- API failures use `{ error, message }`, with every new code mapped in
  `packages/frontend/lib/errors.ts`.
- Authorisation is checked before resource existence is disclosed.
- API responses are snake_case and pass through mappers rather than exposing
  Prisma rows.
- Optional integrations must degrade honestly. Missing GitHub configuration
  disables only GitHub integration and must not prevent Mokara from starting.
- Self-hosted instances make no network call unless an operator configures a
  GitHub App and a user explicitly connects it.
- The frontend CSP remains same-origin. The browser never calls `api.github.com`;
  only top-level navigation to GitHub's authorization/installation pages is
  required.
- There is no automated test suite today. The implementation must include a
  documented manual matrix and pass typecheck, lint, format, and production
  build.

## 4. User experience

### 4.1 Personal settings

Add a **GitHub** integration tile under personal Settings.

Disconnected state:

- Explain that task content is copied to GitHub only when the user asks.
- Show `Connect GitHub` when the backend reports that GitHub is configured.
- Show an honest instance-level disabled message when it is not configured.

Connected state:

- GitHub login connected to this Mokara account.
- Installations/accounts available to the user.
- Repositories selected in each installation.
- `Refresh repositories`, `Add repositories`, and `Disconnect` actions.
- Repository privacy should be visible as text or a normal icon, not inferred
  from whether another team member can open the resulting link.

Do not load GitHub avatar images in v1. That would require a third-party CSP
image source and adds no functional value.

### 4.2 New-task modal

When the current user has at least one active repository connection, add an
optional section:

```text
Create GitHub issue  [ ]
Repository           owner/repository
```

The repository picker includes only repositories available through the current
user's verified connections. It does not include repositories connected by
other Mokara members.

The checkbox defaults off. Its helper text must state that the title,
description, and selected task metadata will be sent to GitHub.

Task creation remains the primary operation:

1. Create the Mokara task.
2. Create subtasks and upload files using the existing flow.
3. If GitHub publishing was selected, request issue publication for the newly
   created task.
4. Close the modal and show the task even when GitHub fails.
5. If publishing failed, show a retryable task-level error rather than a generic
   task-creation failure.

The GitHub request is a separate endpoint after task creation. Do not add a
repository ID to `createTaskSchema`; combining a local database write and a
remote side effect in one endpoint would imply atomicity that does not exist.

### 4.3 Task drawer

A linked task shows:

- `owner/repository#123`
- An external link to the issue.
- `Created by @mokara-user` where useful.

A failed publication shows:

- A short mapped error.
- `Retry` for the user whose connection owns the selected repository.
- `Choose another repository` if the repository is no longer accessible.

Other team members may see the issue URL. GitHub remains responsible for access
to private issue content; clicking a private issue without GitHub permission
will produce GitHub's normal access response.

## 5. Authorization model

### 5.1 Connecting and disconnecting

Any authenticated Mokara user may connect their own GitHub account. This is not
restricted to workspace leaders or paid account owners.

Only that Mokara user may:

- add or remove one of their GitHub installation associations;
- refresh repositories for their connection;
- disconnect their GitHub identity;
- publish through their personal repository connection;
- retry a publication that is still tied to that connection.

### 5.2 Publishing an issue

Before revealing whether a task or repository exists, the backend checks:

1. The actor is a member of the task's team.
2. The requested repository is active.
3. The repository belongs to an installation verified for the actor's GitHub
   account connection.
4. The GitHub App still has repository access.
5. The task has no successful GitHub issue link already.

The client sends an internal repository UUID, never an arbitrary owner/name or
GitHub installation ID. The backend derives all GitHub coordinates from its
verified rows.

### 5.3 Future workspace sharing

Workspace sharing is excluded from v1. If added later, it must be explicit and
revocable:

- the GitHub connection owner chooses a repository to share;
- the Mokara workspace leader approves it unless they are the connector;
- every member may then publish through that one repository;
- the UI clearly labels it as a workspace repository;
- disconnecting or unsharing immediately prevents new writes but preserves
  historical issue links.

A member merely connecting GitHub must never make their repositories available
to teammates.

## 6. Connection and installation flow

GitHub identity and installation ownership are related but not identical. One
GitHub user may access a personal installation plus several organization
installations, and one organization installation may be accessible to several
Mokara users. The model and flow must support that.

### 6.1 Start

`POST /me/integrations/github/connect`:

1. Require a valid Mokara session.
2. Confirm the integration is configured.
3. Generate at least 32 random bytes for `state`.
4. Store a single-use Redis record for 10 minutes:

   ```json
   {
     "purpose": "github_connect",
     "user_id": "mokara-user-uuid",
     "return_path": "/settings"
   }
   ```

5. Return a GitHub authorization URL. The frontend performs a top-level
   navigation to that exact server-produced URL.

The return path is selected from a server allowlist. Never accept an arbitrary
redirect URL from the browser.

### 6.2 Verify the GitHub user

GitHub redirects to the fixed same-origin callback:

```text
GET /api/integrations/github/callback?code=...&state=...
```

The callback:

1. Atomically gets and deletes the Redis state record.
2. Confirms the current Mokara session matches `user_id`.
3. Exchanges the one-time code for a GitHub user access token.
4. Calls GitHub's authenticated-user endpoint and records the immutable GitHub
   numeric user ID and current login.
5. Calls the user-installations endpoint and verifies installation IDs through
   GitHub rather than trusting an ID supplied in a query string.
6. Persists only verified identity and installation metadata.
7. Uses installation access tokens to enumerate repositories selected for each
   verified installation.
8. Best-effort revokes the temporary user token where supported, then drops it
   from memory.
9. Redirects to a fixed Settings result such as
   `/settings?github=connected`.

The authorization code, user token, app JWT, installation token, private key,
and client secret must never appear in application logs, API bodies, database
rows, analytics, or URLs generated after the callback.

Because no GitHub user token is retained, v1 treats user verification as valid
for 24 hours. After that, repository lists are withheld and publishing requires
a quick OAuth reauthorization. This bounds permission drift when someone loses
organization access while the App installation itself remains active.

### 6.3 Installing or changing repository access

If no suitable installation exists, `Add repositories` starts GitHub's App
installation flow. The setup callback's `installation_id` is considered a
claim, not proof. Complete or repeat user authorization and verify that the
installation appears in the authenticated GitHub user's installation list
before associating it with the Mokara user.

For an existing installation, send the user to GitHub's installation settings
page. On return, refresh the installation's repository list from GitHub. Rows
that disappeared become inactive; do not delete historical issue links.

### 6.4 OAuth and setup failures

The callback is browser navigation, so it redirects to Settings with a small,
non-sensitive result code instead of rendering raw JSON:

```text
/settings?github=denied
/settings?github=state_expired
/settings?github=installation_unverified
/settings?github=failed
```

Detailed GitHub response bodies are logged only after redaction. User-facing
copy comes from Mokara's error map.

## 7. Data model

Names below are proposed Prisma model names. Database columns use the existing
snake_case mapping convention. GitHub numeric IDs require PostgreSQL `BIGINT`;
API mappers return them as strings because JavaScript JSON cannot safely carry
all 64-bit integers as numbers.

### 7.1 `GitHubAccountConnection`

One active GitHub identity per Mokara user in v1.

| Field                    | Notes                                            |
| ------------------------ | ------------------------------------------------ |
| `id`                     | UUID primary key                                 |
| `userId`                 | Unique FK to `User`, cascade on account deletion |
| `githubUserId`           | `BIGINT`, immutable GitHub identity              |
| `githubLogin`            | Current display login; refreshable after rename  |
| `status`                 | `active` or `revoked`, enforced with a DB CHECK  |
| `verifiedAt`             | Last successful GitHub user verification         |
| `createdAt`, `updatedAt` | Timestamptz                                      |

Do not enforce global uniqueness on `githubUserId`. A person may deliberately
operate more than one Mokara account, and a self-hosted instance is an isolated
trust domain. The important boundary is that each link was independently
verified.

### 7.2 `GitHubInstallation`

Normalized installation metadata shared when several connected users can access
the same organization installation.

| Field                    | Notes                                         |
| ------------------------ | --------------------------------------------- |
| `id`                     | UUID primary key                              |
| `githubInstallationId`   | Unique `BIGINT`                               |
| `accountId`              | GitHub owner/org numeric ID                   |
| `accountLogin`           | Current owner/org login                       |
| `accountType`            | `User` or `Organization`, DB CHECK            |
| `status`                 | `active`, `suspended`, or `removed`, DB CHECK |
| `lastVerifiedAt`         | Last successful installation API call         |
| `createdAt`, `updatedAt` | Timestamptz                                   |

No token is stored.

### 7.3 `GitHubAccountInstallation`

Verified many-to-many association between a Mokara user's GitHub connection and
an installation.

| Field            | Notes                                           |
| ---------------- | ----------------------------------------------- |
| `connectionId`   | FK to `GitHubAccountConnection`                 |
| `installationId` | FK to `GitHubInstallation`                      |
| `verifiedAt`     | When the GitHub user was confirmed to access it |

Composite primary key: `(connection_id, installation_id)`.

### 7.4 `GitHubRepository`

A server-maintained snapshot of repositories accessible to an installation.

| Field                            | Notes                                         |
| -------------------------------- | --------------------------------------------- |
| `id`                             | UUID primary key exposed to the Mokara client |
| `installationId`                 | FK to `GitHubInstallation`                    |
| `githubRepositoryId`             | `BIGINT`, unique GitHub repository identity   |
| `ownerLogin`, `name`, `fullName` | Refreshable names; never identity keys        |
| `private`                        | Visibility hint for UI                        |
| `active`                         | False after access is removed                 |
| `lastVerifiedAt`                 | Last repository-list confirmation             |
| `createdAt`, `updatedAt`         | Timestamptz                                   |

Use a unique constraint on `(installation_id, github_repository_id)`. GitHub
repository IDs survive renames and transfers; refresh names rather than creating
a second row.

### 7.5 `GitHubAccountRepository`

Verified per-user access to a repository. This is intentionally separate from
installation access: two GitHub users may see the same organization installation
while GitHub permits each of them to access a different repository subset.

| Field          | Notes                                                    |
| -------------- | -------------------------------------------------------- |
| `connectionId` | FK to `GitHubAccountConnection`                          |
| `repositoryId` | FK to `GitHubRepository`                                 |
| `verifiedAt`   | Last OAuth verification of this user's repository access |

Composite primary key: `(connection_id, repository_id)`.

### 7.6 `GitHubIssueLink`

One durable record per published task.

| Field                       | Notes                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `id`                        | UUID primary key                                               |
| `taskId`                    | Unique FK to `Task`, cascade when the Mokara task is deleted   |
| `repositoryId`              | FK to `GitHubRepository`; retain while links exist             |
| `createdByUserId`           | Nullable FK to the Mokara user                                 |
| `connectionId`              | Nullable FK to the connection used for authorization           |
| `githubIssueId`             | Nullable `BIGINT` until creation succeeds                      |
| `issueNumber`               | Nullable integer until creation succeeds                       |
| `issueUrl`                  | Validated HTTPS URL returned by GitHub                         |
| `repositoryFullName`        | Immutable display snapshot for historical links                |
| `status`                    | `creating`, `linked`, or `failed`, DB CHECK                    |
| `attemptCount`              | Retry visibility and diagnostics                               |
| `lastErrorCode`             | Stable Mokara/GitHub classification, never a token or raw body |
| `lastAttemptAt`, `linkedAt` | Timestamptz                                                    |
| `createdAt`, `updatedAt`    | Timestamptz                                                    |

A disconnected account must not erase a working historical issue link. Use
`SET NULL` for user/connection references. Repository rows with issue links are
marked inactive rather than deleted.

## 8. Backend modules and routes

### 8.1 Proposed modules

- `env.ts` — all-or-none feature configuration.
- `lib/github.ts` — OAuth, short-lived credentials, REST calls, issue creation,
  and marker reconciliation.
- `lib/github-state.ts` — single-use Redis state for OAuth/setup callbacks.
- `routes/github.ts` — session-authenticated connection, callback, repository,
  and task publication routes.

Use native `fetch` and the already-installed `jose` package for the GitHub App
JWT. Do not add Octokit in v1 unless native handling proves materially unsafe or
unmaintainable; the required REST surface is small.

Every GitHub fetch must have an abort timeout. Parse only fields the application
needs, and validate them before persistence.

### 8.2 Proposed API

```text
GET    /me/integrations/github
POST   /me/integrations/github/connect
GET    /integrations/github/callback
POST   /me/integrations/github/install
POST   /me/integrations/github/refresh
DELETE /me/integrations/github

POST   /tasks/:id/github-issue
```

The callback remains session-authenticated. A top-level GitHub redirect sends
the existing SameSite=Lax session cookie; state adds CSRF and flow binding.

Suggested publication input:

```json
{
  "repository_id": "internal-repository-uuid"
}
```

Suggested successful link response:

```json
{
  "github_issue": {
    "status": "linked",
    "repository_full_name": "owner/repository",
    "issue_number": 123,
    "issue_url": "https://github.com/owner/repository/issues/123",
    "created_by_user_id": "mokara-user-uuid"
  }
}
```

The normal task mapper should include a nullable summary of the linked/failed
state so board updates and task refetches do not wipe integration state.

### 8.3 Error codes

At minimum, add and map:

| Code                             | Meaning                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `github_not_configured`          | Instance operator has not configured a GitHub App                    |
| `github_state_expired`           | OAuth state is absent, expired, or already consumed                  |
| `github_access_denied`           | User denied authorization or installation                            |
| `github_installation_unverified` | Claimed installation is not visible to the authenticated GitHub user |
| `github_connection_required`     | Actor has no active personal connection                              |
| `github_repository_forbidden`    | Repository is not available through the actor's connection           |
| `github_repository_unavailable`  | App installation lost repository access                              |
| `github_issue_already_linked`    | Task already has a successful issue link                             |
| `github_rate_limited`            | GitHub rate limit prevents the action now                            |
| `github_unavailable`             | GitHub timed out or returned a retryable server failure              |
| `github_publish_failed`          | Non-specific safe publication failure                                |

GitHub authentication failures should mark the relevant installation or
repository stale/inactive where appropriate. Raw GitHub error bodies are not
safe UI copy.

## 9. Issue creation and reliability

### 9.1 Issue content

Issue title is the Mokara task title. Build the body on the server from a stable
template:

```markdown
{task description, when present}

---

Mokara task metadata

- Priority: High
- Status: Todo
- Due: 2026-09-30
- Assignee: @mokara_username

<!-- mokara-task:{task UUID} -->
```

Do not transfer:

- attachments or their signed/download URLs;
- comments;
- KPI values;
- member email addresses;
- internal event history;
- session or API identifiers other than the opaque task UUID marker.

A backlink may be added only after the backend has an explicit, trusted public
Mokara origin. Never derive it from an untrusted `Host` header.

### 9.2 Publication sequence

`POST /tasks/:id/github-issue`:

1. Check team membership.
2. Check the actor's connection-to-repository authorization.
3. Start a database transaction and lock/find the task's issue-link row.
4. If already `linked`, return `github_issue_already_linked` with the existing
   safe link summary.
5. Create or update the row to `creating`, incrementing `attempt_count`.
6. Commit before the external request.
7. Mint an installation token and re-confirm repository access.
8. Search/reconcile by the hidden Mokara marker when this is a retry or an
   interrupted `creating` attempt.
9. If an existing issue is found, persist it instead of creating another.
10. Otherwise call GitHub's create-issue endpoint.
11. Validate GitHub's issue ID, number, and HTTPS URL, then mark the row
    `linked`.
12. On failure, mark it `failed` with a stable redacted code and return a mapped
    retryable or inline error.

No SQL transaction remains open during a GitHub network request.

### 9.3 Duplicate limitation

GitHub's create-issue endpoint does not provide a general idempotency key. A
process can crash after GitHub creates an issue but before Mokara stores the
response. The hidden marker is the reconciliation key.

Search indexing may lag. Therefore an interrupted attempt should first enter a
`Check GitHub`/reconciliation state and retry with backoff rather than creating
again immediately. This does not make the distributed operation perfectly
atomic, but it makes duplicate creation rare and recoverable without pretending
otherwise.

A future durable outbox worker can automate retries, but it does not remove the
same post-side-effect crash window; marker reconciliation is still required.

## 10. GitHub API boundaries

The client wrapper should need only these classes of calls:

- exchange OAuth authorization code;
- get authenticated GitHub user;
- list installations available to that user;
- create an installation access token;
- list repositories available to an installation;
- create an issue;
- find/reconcile an issue by the Mokara marker;
- optionally revoke the temporary user token.

Rules:

- GitHub API origins are constants in backend code, never client input.
- Send a pinned GitHub API version header.
- Set a clear Mokara `User-Agent`.
- Treat redirects from API calls as errors rather than following them to an
  arbitrary origin.
- Bound response size before parsing when practical.
- Classify 401/403, 404, 422, rate-limit, timeout, and 5xx separately.
- Read rate-limit headers for retry guidance but do not expose them as trusted
  UI text.
- Cache installation tokens only in memory or Redis for less than their GitHub
  expiry; caching is an optimization, never persisted truth.

## 11. Configuration

Proposed optional backend environment variables:

```env
GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY_BASE64=
GITHUB_CALLBACK_URL=
GITHUB_PUBLIC_APP_URL=
```

`GITHUB_PUBLIC_APP_URL` is optional and is used only for issue backlinks.
`GITHUB_CALLBACK_URL` must exactly match the callback registered in the GitHub
App and must be HTTPS in production.

The private key is base64-encoded to avoid multiline environment parsing
problems. It is decoded in memory and never logged.

Configuration behavior follows storage and billing:

- all required values present and valid: integration enabled;
- all empty: integration intentionally disabled, no startup warning;
- partially configured: integration disabled and one actionable startup warning;
- invalid production callback URL or malformed key: integration disabled, never
  a partial mount;
- missing configuration never stops task management, auth, or startup.

Update the backend `.env.example` and deployment documentation without adding
real app IDs, installation IDs, repository names, or keys.

Hosted Mokara uses the operator's GitHub App. A self-hoster creates their own
GitHub App and supplies their own values; nothing phones home to a Mokara-owned
service.

## 12. Security and privacy checklist

- OAuth state is cryptographically random, short-lived, bound to one Mokara
  user and purpose, and atomically consumed.
- The callback verifies both session and state.
- Installation IDs are verified through an authenticated GitHub user flow.
- Repository authorization is derived server-side for every write.
- GitHub private key, client secret, OAuth code, user token, app JWT, and
  installation tokens are redacted from all logs and errors.
- No GitHub token is sent to the browser or stored in PostgreSQL/localStorage.
- Disconnecting stops future writes immediately.
- Installation/repository revocation is handled as a normal disabled state, not
  as an unhandled exception.
- Repository pickers and connection settings are visible only to the connected
  Mokara user in v1. Once a task is published, its repository name and issue
  link are visible to every member who can view that task; GitHub still enforces
  access to the private issue itself.
- The issue checkbox is opt-in and explains which task fields leave Mokara.
- No attachment bytes or URLs are transferred.
- External links use `rel="noreferrer"`/safe new-tab behavior if opened in a new
  tab.
- Fixed callback and return URLs prevent open redirects.
- New legal/privacy wording requires maintainer review; this implementation plan
  does not edit the jurisdiction-checked legal pages.

## 13. Rate limits and operational behavior

- One task action produces at most one issue-create request after reconciliation.
- Repository lists are refreshed through user OAuth on explicit action and
  after a successful connection, not on every task modal open.
- Cache repository data in PostgreSQL; the task modal reads Mokara's API only.
- Installation tokens may be cached briefly in Redis under an installation ID
  with expiry below GitHub's token expiry.
- A GitHub outage leaves tasks usable and issue publishing retryable.
- Log operation name, Mokara user ID, internal installation/repository UUID,
  response status, GitHub request ID, and elapsed time. Never log request bodies
  containing task descriptions or credential-bearing headers.
- Expose connection health through Settings, not by repeatedly probing GitHub in
  page renders.

## 14. Delivery phases

### Phase 0 — product and GitHub App setup

1. Confirm v1 decisions in section 1.
2. Register development and production GitHub Apps with minimum permissions.
3. Fix callback/setup URLs and repository-selection mode.
4. Review GitHub's current terms and the required privacy disclosure.
5. Decide whether the feature is available to every hosted plan. The technical
   recommendation is ungated in v1 and available to self-hosters when configured;
   do not silently invent a plan gate during implementation.

**Done when:** a maintainer can install the development App on a test repository
and all secrets are held outside the repository.

### Phase 1 — schema and configuration

1. Add the six Prisma models and relations described in section 7.
2. Write the hand-authored SQL migration with indexes, foreign keys, and CHECKs.
3. Add optional all-or-none environment parsing and startup diagnostics.
4. Add API response types and mappers without exposing raw Prisma records or
   unsafe bigint values.

**Done when:** configured and unconfigured instances both boot, and the migration
applies cleanly to a populated local database.

### Phase 2 — connection flow

1. Add Redis state helpers with namespaced keys and atomic consume behavior.
2. Add app JWT, OAuth exchange, user verification, and installation-token code.
3. Add personal connection/list/refresh/disconnect routes.
4. Add Settings API methods, error rules, and the integration tile.
5. Verify personal and organization installations, selected repositories,
   denial, stale state, account rename, and repository rename.

**Done when:** two different Mokara users can independently connect different
GitHub accounts and see only their own repositories.

### Phase 3 — task publishing

1. Add issue-link persistence and task response summary.
2. Add deterministic server-side issue body generation and hidden marker.
3. Add publication, reconciliation, and retry endpoints.
4. Add the opt-in repository picker to the task modal.
5. Add linked/failed states and external issue link to the task drawer.
6. Preserve normal task creation when every GitHub operation fails.

**Done when:** two members in one Mokara team can each publish a task to their
own repository without seeing or using the other's repository connection.

### Phase 4 — hardening and release

1. Redaction review for every log and error path.
2. Rate-limit and timeout handling.
3. Disconnect/revocation and repository-removal behavior.
4. Responsive UI review at the repository's required widths.
5. Production build and complete manual matrix below.
6. Update operator setup documentation and approved privacy copy.

**Done when:** the integration fails closed, never blocks task management, and
has a reproducible operator setup guide.

## 15. Manual verification matrix

Run at minimum:

### Configuration

- No GitHub env: backend boots; Settings says unavailable; tasks work.
- Partial env: one clear warning; integration remains unavailable.
- Valid development App: connection controls appear.

### Connection security

- Successful personal installation.
- Successful organization installation.
- Organization approval pending.
- User denies authorization.
- Expired, replayed, and wrong-user state.
- Tampered installation ID.
- GitHub account with no installations.
- Repository selection changed after connection.
- Repository renamed or transferred.
- Installation suspended/uninstalled.

### Multi-user isolation

- Alice and Bob belong to the same Mokara team.
- Alice connects repository A; Bob connects repository B.
- Alice's modal lists A, never B.
- Bob's modal lists B, never A.
- Forging Bob's internal repository UUID in Alice's request returns 403 without
  repository details.
- Both may publish different tasks and see resulting links.

### Publishing

- Title only.
- Description with Markdown and HTML-like text.
- Priority, due date, and assignee formatting.
- Private repository.
- Existing linked issue.
- Concurrent double click/request.
- GitHub 401/403, 404, 422, rate limit, timeout, and 5xx.
- Lost response after issue creation followed by marker reconciliation.
- Task deletion does not delete or close the GitHub issue.
- Disconnect preserves the historical link but blocks retry/new publication.

### Regression

- Task creation without GitHub selected is unchanged.
- Attachments and subtasks still complete after task creation.
- Team real-time updates still carry a complete task shape.
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, and frontend production build
  pass.

## 16. Explicit non-goals for v1

- GitHub as a Mokara login provider.
- Importing existing GitHub issues as Mokara tasks.
- Automatic issue creation for every task.
- Workspace-wide use of another member's installation.
- More than one GitHub issue per task.
- Updating issue title/body after creation.
- Mapping open/closed to Mokara statuses.
- GitHub webhooks or comments synchronization.
- Copying GitHub comments into Mokara or vice versa.
- Uploading Mokara attachments to GitHub.
- Mapping Mokara members to GitHub assignees.
- Labels, milestones, projects, pull requests, branches, or commits.
- Background workers/outbox infrastructure solely for this feature.

## 17. Later extensions

After v1 is stable, separately design:

1. **Explicit workspace repository sharing** with connector consent and leader
   approval.
2. **Project-to-repository defaults** rather than a workspace-wide default.
3. **Outbound updates** with field-level ownership and conflict rules.
4. **Signed GitHub webhooks** with delivery-ID deduplication for issue
   close/reopen/rename and installation changes.
5. **Status mapping** (`completed` → `done`, `not_planned` → `canceled`, reopen
   policy still requiring a product decision).
6. **Issue import**, which needs deduplication and a clear creator/assignee
   policy.

Each extension changes authorization or synchronization semantics and should be
its own reviewed phase rather than being folded into the first implementation.

## 18. Acceptance criteria

The v1 integration is complete only when:

- every Mokara user can independently connect a verified GitHub identity;
- a user can access multiple personal/organization installations when GitHub
  permits it;
- no user can enumerate or use another user's personal repositories through
  Mokara;
- task publishing is opt-in and copies only documented fields;
- a GitHub failure never prevents or removes the Mokara task;
- successful links survive disconnect and repository rename;
- credentials never persist in PostgreSQL or reach the browser/logs;
- unconfigured self-hosted instances retain all existing behavior;
- all new API error codes use the centralized error contract;
- the manual multi-user, revocation, failure, and regression matrix passes.
