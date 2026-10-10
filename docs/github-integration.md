# GitHub integration

**Implemented in code; live GitHub delivery and owner acceptance still required.**

## Product rules

- Each Mokara user connects their own GitHub account. Repository access is not shared with teammates.
- GitHub may grant access to all repositories, but Mokara activates **at most three repositories per user**, across personal and organization installations. This fixed cap also applies to self-hosted instances.
- After connecting, select repositories in **Settings → GitHub → Manage repositories**. Refresh preserves selections that are still accessible; switching GitHub identities clears selections. Inactive repositories remain visible in Settings but cannot publish or sync.
- Issue creation is optional per task. A task links to at most one issue; title/body are copied only at publication and are not subsequently synchronized.
- Issue links survive disconnection, repository deactivation and renames. These actions pause future synchronization; they do not close or delete anything on GitHub.

## Status mapping

| Action                                     | Mokara task                      | Linked GitHub issue                  |
| ------------------------------------------ | -------------------------------- | ------------------------------------ |
| Mokara task → Done                         | Done                             | Closed as completed                  |
| Mokara Done → Todo                         | Todo                             | Reopened                             |
| Mokara Done → In progress                  | In progress                      | Reopened                             |
| GitHub issue closed, including Not planned | Done                             | Closed                               |
| GitHub issue reopened                      | In progress                      | Open                                 |
| Associated branch created                  | In progress, unless already Done | Remains open; never closes the issue |
| Linked PR opened                           | In progress, unless already Done | Remains open; never closes the issue |
| Linked PR closed, merged **or unmerged**   | Done                             | Closed as completed                  |
| Linked PR reopened                         | In progress                      | Reopened                             |

Mokara does not merge, close or reopen PRs itself. A completed task is never downgraded by a delayed branch/PR-open event. If a development event observes an already closed issue, completion takes precedence unless the PR was explicitly reopened.

### Branch and PR association

- Use an exact issue-number prefix: `issue-123-fix-login`, `123-fix-login`, or `123/fix-login`. Arbitrary numbers elsewhere in branch names are not associations.
- For PRs, use GitHub's explicit issue linkage, such as `Closes #123` targeting the repository's default branch, or a head branch following the convention above. GitHub's `closingIssuesReferences` is authoritative; unrelated textual mentions are not parsed as links.
- Only issues in the PR's base repository are supported. Cross-repository references are intentionally excluded from repository-scoped App tokens.
- Once observed, PR-to-issue associations are remembered so later PR-body/branch edits do not sever status synchronization.
- Tags, arbitrary branches, unknown issues, wrong installations, and PR-shaped `issues` events are ignored.

## Operator setup

Configure a GitHub App, not a classic OAuth token or personal access token.

### Permissions

| Repository permission | Level      | Purpose                                                   |
| --------------------- | ---------- | --------------------------------------------------------- |
| Metadata              | Read       | Repository identity                                       |
| Issues                | Read/write | Create issues and close/reopen them                       |
| Pull requests         | Read       | Read PR state and explicit issue references               |
| Contents              | Read       | Subscribe to branch creation and verify the branch exists |

No Actions, Administration, organization Members or Contents write permission is needed. Existing installations may need to approve the added read permissions.

### Environment

Backend environment variables:

```env
GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY_BASE64=
GITHUB_CALLBACK_URL=
GITHUB_PUBLIC_APP_URL=
GITHUB_WEBHOOK_SECRET=
```

The first six values enable connection/publishing. The private key is base64-encoded PEM. `GITHUB_PUBLIC_APP_URL` is an optional trusted origin for issue backlinks.

Set `GITHUB_WEBHOOK_SECRET` to a separate random secret of at least 32 characters and enter the identical value in GitHub's webhook secret field. Do not reuse the OAuth client secret. Never commit or log these values. Missing webhook configuration leaves existing connection/publishing usable, and Settings warns that incoming synchronization is unavailable.

### URLs and events

- Authorization callback and Setup URL: `https://<frontend-origin>/api/integrations/github/callback`.
- Webhook URL: `https://<frontend-origin>/api/integrations/github/webhook`.
- Enable webhook delivery and subscribe to **Issues**, **Pull request**, **Create**, **Installation**, **Installation repositories**, and **GitHub App authorization** (some lifecycle events are sent automatically).
- Production URLs must use HTTPS. GitHub cannot deliver to localhost: local acceptance needs an owner-managed, publicly reachable HTTPS tunnel to the frontend proxy. OAuth callbacks can continue using the configured local browser origin.
- Save the App changes, accept any installation permission update, refresh the Mokara connection, and activate up to three repositories.
- Check GitHub's Recent deliveries for successful `202` responses and any redelivery failures. `202` means durably queued, not fully synchronized: inspect task sync feedback/backend logs for processing failures. A configured secret does not prove the URL is reachable or the App subscriptions are correct.

No credentials, GitHub configuration, tunnel or deployment are changed automatically by this implementation.

## Authorization and reliability

- OAuth uses single-use Redis state bound to the signed-in Mokara user. Temporary user tokens are discarded/revoked after verification; installation tokens exist only in memory.
- Each publishing request checks the user's **specific enabled repository association**, not merely access to an organization installation. Installation/repository pagination includes repositories beyond the first 100.
- Activation is backend-enforced and serialized with refresh/disconnect through a per-user database row lock. Forged, inaccessible and duplicate IDs cannot bypass the three-repository cap.
- Existing 24-hour GitHub-user verification remains enforced. After expiry, reconnect to verify access and resume synchronization. No user token is retained for background reauthorization.
- A linked task syncs only while its publisher's connection/repository remains active and that user still belongs to the task's workspace. Disconnection, deactivation, removal, suspension or revocation pauses sync with a visible reason.
- Reconnection/reactivation resumes paused/failed links using the **current Mokara task status**. Changes made locally while paused therefore reconcile to GitHub. This is not an import/backfill of GitHub activity missed during the pause.
- The public webhook authenticates exact raw request bytes with constant-time HMAC-SHA256 comparison and a 1 MiB body limit. It does not use a session cookie. Only validated coordinates/actions, not full private webhook bodies, are stored.
- Webhooks are acknowledged only after delivery-ID deduplication and durable inbox persistence. Task status/history and outgoing jobs commit atomically.
- The backend worker polls the PostgreSQL inbox/outbox, leases jobs across replicas/restarts, and retries failures with exponential backoff capped at 15 minutes. Local tasks remain saved during GitHub outages. Completed jobs remain for deduplication; operators should account for table growth.
- Remote state is fetched before applying an event. Stored issue/PR timestamps and latest local status timestamps protect against stale deliveries; issue-state echoes do not generate new task transitions or overwrite a local Todo reopening.
- No database transaction or task lock stays open during a GitHub request. Short task transactions use sync revisions to reject raced results. If an older remote write completes after a newer local change, a corrective outbox reconciles the latest status. Pending local intent wins over issue webhook echoes until the outbox completes.
- Webhook activity uses `TaskEvent.source = github`, a nullable Mokara actor and the GitHub login. It participates in analytics, due-soon regeneration and full-shape `task_updated` realtime events without impersonating the connector.
- The drawer shows pending, paused and failed sync. Retry sync reconciles the current task status to GitHub; Settings fixes access-related pauses.
- Creation retains the hidden `<!-- mokara-task:{UUID} -->` marker for retry reconciliation. Deleting a Mokara task does not delete/close the GitHub issue.

## Routes and storage

All paths are under `/api` through the existing same-origin frontend proxy:

```text
GET    /me/integrations/github
PUT    /me/integrations/github/repositories  { "repository_ids": ["internal-uuid"] }
POST   /me/integrations/github/connect
POST   /me/integrations/github/install
POST   /me/integrations/github/refresh
DELETE /me/integrations/github
GET    /integrations/github/callback
POST   /integrations/github/webhook        # public, HMAC-authenticated
POST   /tasks/:id/github-issue             { "repository_id": "internal-uuid" }
POST   /tasks/:id/github-sync
```

Activation is `GitHubAccountRepository.enabled`, not the installation-wide `GitHubRepository.active` access flag. `GitHubIssueLink` stores publishing status separately from sync status/error and observed remote state. `GitHubPullRequestLink` remembers associations; `GitHubSyncJob` is the durable inbox/outbox.

Migration: `20261010120000_github_status_sync`. Existing repository associations default to **inactive** so activation is explicit. The owner's normal bootstrap applies committed migrations and regenerates Prisma; agents do not modify the running database merely to verify this feature.

## Verification

Exit-once checks:

```sh
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm format
pnpm --filter @mokara/backend test:github
```

The automated module tests use in-memory ORM/API/Redis doubles, generate disposable test keys and make no network requests or changes to the running app. They cover quota/access boundaries, signed ingress/deduplication, normal task PATCH/outbox/history, issue and merged/unmerged PR close/reopen, branch/PR creation, echoes, stale events, pauses, outage retries and lease recovery. They do **not** replace live GitHub or real-Postgres concurrency acceptance. Builds remain CI-owned.

### Owner acceptance checklist

1. Apply the migration through normal bootstrap; configure the added secret, permissions, events and reachable webhook URL.
2. Connect two users sharing an organization installation but with different repository access; confirm each sees/uses only their own subset.
3. Activate three repositories across installations; a fourth is blocked by UI and backend. Refresh retains valid selections. Disable one and activate another.
4. Publish a task, move it to Done, then Todo/In progress; GitHub closes/reopens and the task retains the selected local status.
5. Close its issue directly, including Not planned; task becomes Done. Reopen it; task becomes In progress.
6. Create a matching branch and a linked PR; task starts without closing the issue. Close the PR both merged and unmerged; task becomes Done and its issue closes. Reopen an unmerged PR; task/issue reopen.
7. Redeliver duplicate/old webhooks; verify no repeated activity or completed-task downgrade.
8. Remove repository access, suspend/uninstall the App, revoke authorization, expire verification and disconnect; sync pauses while historical links remain. Restore access/reactivate; current local status reconciles.
9. Simulate a GitHub outage/restart; tasks remain saved, failed sync is visible and durable jobs retry after recovery.
10. Verify Settings and drawer layouts at 1280/1440/1600/1920 and mobile, analytics/reminders and a teammate's realtime board.

## Non-goals

GitHub login, importing existing issues, workspace credential sharing, automatic publishing, title/body/comment/attachment synchronization, GitHub assignee mapping, labels/milestones and cross-repository PR linkage are not included.
