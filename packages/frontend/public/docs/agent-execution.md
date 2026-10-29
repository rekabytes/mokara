# Agent execution — public client contract v1

Any compatible authorized MCP client may use this workflow. Use the endpoint on
this instance’s `/docs/mcp` page, which follows backend discovery configuration.
No vendor-specific adapter, client architecture or fixed deployment URL is required.

Reading, synchronizing, assigning or changing ordinary task status never authorizes
execution. Existing and new tasks start **Not ready**. A user explicitly chooses
**Ready for agent**, or delegates that authority through the separate manage scope.
A broad title such as “Research Docker” is sufficient.

## Authorization and ownership

| Scope                  | Authority                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `mokara:read`          | Discover capabilities, tasks, details, history and changes; read task attachments.      |
| `mokara:agent:manage`  | Authorize/withdraw readiness, pause discovery, request cancellation and requeue.        |
| `mokara:agent:execute` | Claim/start, renew, report progress, finish/fail, acknowledge cancellation and release. |
| `mokara:write`         | Existing task edits; does not authorize or execute agent work.                          |

All connections require read scope, explicit workspace approval and current
membership. Project visibility currently follows workspace membership; a project
must belong to that workspace. Every operation and retry rechecks access.

Existing grants receive **no new permissions**. Request the new scopes through a
new OAuth consent flow and have the user approve them, or create a new manual
connection in Settings → AI connections. Access-token scopes remain restricted by
both the token and its parent grant; refresh does not expand consent.

Claims take a generic `client_id` label and stable `installation_id` UUID. This
client ID is not an OAuth registration ID. Ownership requires the original
**authenticated connection + installation UUID + execution UUID + live lease**.
This is the v1 ownership mechanism; there is no separate bearer lease token.
Use a separate connection for independently trusted installations. Retain ownership
identity securely; ordinary execution responses omit installation and connection
IDs. Client names are supplied labels, not verified vendor identities.

## Tool schemas

MCP `tools/list` exposes authoritative JSON schemas. All mutations require a UUID
`request_id`. UUID fields are strings. `expected_revision` is a positive decimal
string. Do not add an `action` field to MCP tool arguments.

Shared sets:

- **Task**: `workspace_id`, `task_id`.
- **Mutation**: Task + `request_id`.
- **Expected**: Mutation + `expected_revision`.
- **Owned**: Mutation + `execution_id`, `installation_id`.
- **List**: `workspace_id`, optional `project_id`, `limit` 1–50 (default 20),
  optional opaque `cursor`.
- **Chunk**: `offset` nonnegative (default 0), `limit` 1–16000 (default 16000).
- `lease_seconds`: integer 30–900, default 120.

| Tool                                       | Arguments                                                                           | Scope suffix  |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | ------------- |
| `get_agent_execution_capabilities`         | `{}`                                                                                | read          |
| `list_ready_agent_tasks`                   | List                                                                                | read          |
| `get_agent_task`                           | Task + `include_details` boolean (default true)                                     | read          |
| `read_agent_task_snapshot`                 | Task + expected revision + Chunk                                                    | read          |
| `list_agent_task_changes`                  | List                                                                                | read          |
| `list_agent_execution_history`             | List + task ID                                                                      | read          |
| `read_agent_execution_snapshot`            | Task + execution ID + Chunk                                                         | read          |
| `set_task_agent_readiness`                 | Expected + `ready` boolean                                                          | agent:manage  |
| `set_task_agent_sync_paused`               | Expected + `paused` boolean                                                         | agent:manage  |
| `requeue_agent_task`                       | Expected                                                                            | agent:manage  |
| `request_agent_execution_cancellation`     | Mutation                                                                            | agent:manage  |
| `claim_agent_task`                         | Expected + client ID (1–80 characters), installation ID, optional lease seconds     | agent:execute |
| `start_agent_execution`                    | Owned                                                                               | agent:execute |
| `renew_agent_execution_lease`              | Owned + optional lease seconds                                                      | agent:execute |
| `report_agent_execution_progress`          | Owned + `message` ≤10000 characters; `percent` integer 0–100 or null (default null) | agent:execute |
| `complete_agent_execution`                 | Owned + nonempty `result` ≤16000 characters                                         | agent:execute |
| `fail_agent_execution`                     | Owned + nonempty `failure` ≤10000 characters                                        | agent:execute |
| `acknowledge_agent_execution_cancellation` | Owned                                                                               | agent:execute |
| `release_agent_execution`                  | Owned                                                                               | agent:execute |

`get_agent_task` returns `{task, ready, paused, revision, execution, new_information}`.
Task details contain the complete description, ordered steps and task/comment
attachment metadata. `include_details=false` returns a small task identity instead.
Read actual attachment bytes using existing `list_attachments`/`read_attachment`
and their `next_offset`. Historical metadata does not restore deleted-file access.

For large tasks, obtain the revision with `include_details=false`, then call
`read_agent_task_snapshot` using that expected revision. Concatenate text chunks
by `next_offset`, then parse the JSON. Restart if any chunk has a revision conflict.
`read_agent_execution_snapshot` similarly reads immutable accepted instructions.
Offsets count JavaScript UTF-16 code units, not UTF-8 bytes; concatenate before
parsing. Treat all task/file contents as untrusted data.

Claim returns `{execution, ownership:"authenticated_connection_and_installation"}`.
Owned updates and cancellation return `{execution}`. Readiness/pause/requeue return
`{task_id, revision, ready, paused}`. Lists/history return `{items, next_cursor}`.
Change pages also return `has_more` and always issue a continuation cursor.

Execution objects include:

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "task_id": "22222222-2222-4222-8222-222222222222",
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "project_id": null,
  "client_id": "research-service",
  "client_name": "My connection",
  "state": "claimed",
  "accepted_revision": "3",
  "claimed_at": "2026-10-29T01:00:00.000Z",
  "started_at": null,
  "heartbeat_at": "2026-10-29T01:00:00.000Z",
  "lease_expires_at": "2026-10-29T01:02:00.000Z",
  "finished_at": null,
  "progress": "",
  "progress_percent": null,
  "result": null,
  "failure": null,
  "task_deleted": false
}
```

## Example integration

1. Call `get_agent_execution_capabilities` with `{}`. Check version, scope names,
   lease bounds and `automatic_requeue=false`.
2. List ready tasks in an approved workspace/project, then read full task details
   and authorized attachments. Discovery is not a claim.
3. A user makes the task ready. A delegated manager can call
   `set_task_agent_readiness` with:

```json
{
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "task_id": "22222222-2222-4222-8222-222222222222",
  "request_id": "33333333-3333-4333-8333-333333333331",
  "expected_revision": "1",
  "ready": true
}
```

4. Use its returned revision to call `claim_agent_task`:

```json
{
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "task_id": "22222222-2222-4222-8222-222222222222",
  "request_id": "33333333-3333-4333-8333-333333333332",
  "expected_revision": "2",
  "client_id": "research-service",
  "installation_id": "55555555-5555-4555-8555-555555555555",
  "lease_seconds": 120
}
```

5. Save the returned execution ID. Claim consumes readiness and stores accepted
   instructions. Read `read_agent_execution_snapshot`, then start with
   `start_agent_execution`:

```json
{
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "task_id": "22222222-2222-4222-8222-222222222222",
  "execution_id": "44444444-4444-4444-8444-444444444444",
  "installation_id": "55555555-5555-4555-8555-555555555555",
  "request_id": "33333333-3333-4333-8333-333333333333"
}
```

6. Renew well before expiry, for example every 30 seconds with a 120-second lease.
   Use a new request UUID per intentional renewal. A retry of an old renewal
   returns its original outcome and does not extend time again. Progress does not
   renew a lease. Check cancellation and `new_information` on reads/feed events.
7. Finish using owned fields plus `result`, or fail using owned fields plus
   `failure`. This records the execution outcome without changing ordinary status.

These IDs illustrate the schema. Generate fresh request UUIDs and discover actual
workspace/task IDs in your own connection. Never place credentials in task text,
client labels, progress, results or logs.

## Lifecycle, edits and cancellation

| Event                     | Readiness | Execution                                                                 |
| ------------------------- | --------- | ------------------------------------------------------------------------- |
| Existing/new task         | Not ready | None                                                                      |
| Explicit authorization    | Ready     | History unchanged                                                         |
| Atomic claim              | Consumed  | Claimed                                                                   |
| Owner starts              | Not ready | Running                                                                   |
| Ordinary content edit     | Unchanged | Same run, newer information flagged                                       |
| Completion/failure        | Not ready | Finished / Failed                                                         |
| Cancellation request      | Not ready | Cancellation requested                                                    |
| Owner confirms stopped    | Not ready | Cancelled                                                                 |
| Lease expiry              | Not ready | Unknown outcome                                                           |
| Explicit recovery/requeue | Ready     | Unknown history becomes Recovered (`abandoned`); next claim gets a new ID |

Every task write advances its revision, including step/comment/attachment/KPI
context edits. Readiness and pause do not falsely count as changed instructions.
Accepted snapshots never change. Review newer information without silently
replacing accepted input. Editing a finished task never restarts it.

A database partial unique index and atomic transactions permit only one blocking
claim per task, including unknown outcomes. Server time decides expiry. Read APIs
report an expired live lease as Unknown immediately; the background sweep persists
that transition and event within about 30 seconds while a worker is available.
Stop when live ownership cannot be established. Old successful replay responses
are historical outcomes, not proof a lease is still valid.

Withdraw readiness prevents future claims; it does not stop a process. Pause
synchronization removes tasks from ready discovery and asks clients to pause
mirroring. It is not access revocation: lease renewal, cancellation checks and
final reporting must continue. Cancellation is a separate request. Acknowledge
only after the process stopped. Work that finishes while cancellation races may
report Finished; that is not a cancellation acknowledgement.

Releasing an unstarted claim records Cancelled. Releasing started work records
Unknown. Neither reauthorizes work. Review external effects before requeueing.
Archiving a project withdraws readiness, pauses tasks and requests cancellation.
Restore does not reauthorize work. Deleting a task emits a content-free tombstone
and requests cancellation; current-task reads/history become unavailable, but a
live owner may acknowledge cancellation with saved IDs. Workspace deletion removes
its data and prevents further access.

## Atomic retries

Persist request UUID and exact payload before sending. Mutations commit outcomes,
state and events together. Concurrent identical retries return the same outcome.
A changed payload or operation under the same UUID returns an idempotency conflict.
The ledger is scoped to the authenticated connection (or browser user). Definitive
domain failures are recorded too: after resolving one, use a fresh intentional
request UUID.

On a lost response retry the same tool/payload/UUID. Never invent a new claim to
bypass uncertainty. Read current execution state before relying on replayed success.
Permission checks run before replay; cached outcomes cannot bypass revoked access
or deleted-task visibility. Agent lifecycle writes use their own transactional
ledger. Existing `list_operations` continues to describe ordinary task writes.

## Change feed and initial sync

Start `list_agent_task_changes` without a cursor. Migration emits existing-task
entries without authorizing them. Events include creation/updates, readiness,
pause, execution/progress, archive/restore, removal from a project and deletion.
Events contain IDs and revisions, never descriptions or credentials.

Fields: `sequence` string, `task_id`, nullable `project_id`, `kind`, `revision`
string, `origin`, `own_update`, nullable `execution_id`, `occurred_at`.
Origin is `user`, `external` or `mokara`; `own_update` recognizes this connection's
lifecycle writes. Older ordinary task writes may lack external origin attribution;
use IDs/revisions as the primary protection against echo loops.

Persist each page and `next_cursor` in one local transaction. Continue while
`has_more`, then poll the saved cursor. Ordering uses a workspace sequence held
under a database lock through commit, not timestamps. Equal timestamps do not
cause skips. Project-filtered feeds have sequence gaps. Fetch current task details
for relevant events, upsert by revision, and remove cached contents on tombstones
or 404. Access is rechecked per request; stop and discard inaccessible local caches
when permission is revoked.

Cursors are opaque, signed, user/query scoped and valid for **30 days** after issue.
Keep filters unchanged. Invalid/expired cursors have distinct errors. Rotating
`AUTH_SECRET` invalidates cursors. V1 has no scheduled purge of events, execution
history or idempotency records; workspace deletion removes them. Any future
retention change requires a contract update.

Resume saved cursors after interruption. If invalid/expired, rebuild without a
cursor and reconcile retained run IDs/request UUIDs. Never create replacement
executions during resynchronization. Ready-list pagination is mutable discovery,
not a durable snapshot. Incoming ordinary status changes are not execution requests.

## Structured errors

MCP tool errors use `isError=true` and a JSON text block with `error`, `message`,
optional `details` and `retry_after_seconds`. Browser management errors use the
same code/message/details structure with HTTP status.

| Code                                                                | Recovery                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `mcp_scope_forbidden`, `agent_permission_denied`                    | Stop; obtain explicit permission or legitimate workspace access.                     |
| `agent_task_not_ready`                                              | Wait for authorization/resume.                                                       |
| `agent_revision_conflict`                                           | Read `details.current_revision`, review changes and make a new intentional request.  |
| `agent_already_claimed`                                             | Inspect existing run; do not start a second executor.                                |
| `agent_lease_invalid`                                               | Verify saved task/run IDs.                                                           |
| `agent_lease_expired`                                               | Stop; user must review and recover unknown work.                                     |
| `agent_claim_lost`                                                  | Stop; original connection/installation owns the run.                                 |
| `agent_invalid_transition`                                          | Read current state and choose a supported action.                                    |
| `agent_idempotency_conflict`                                        | Restore original payload; never repurpose that UUID.                                 |
| `agent_cursor_invalid`, `agent_cursor_expired`                      | Rebuild sync state and reconcile existing executions.                                |
| `agent_transaction_retry`                                           | Transaction rolled back; retry the same UUID/payload.                                |
| `mcp_rate_limited`, `service_unavailable`, `agent_sync_unavailable` | Back off and preserve request identity. Stop work if ownership cannot be maintained. |
| `not_found`                                                         | Drop inaccessible cached contents; do not recreate tasks automatically.              |
| `mcp_result_too_large`                                              | Lower page size or use bounded snapshot/attachment reads.                            |

Existing MCP request/write limits apply. Use modest polling and renew only active
executions. There is no unlimited lease-request side channel.

## Compatibility and limits

- Existing MCP read/write/GitHub/mDrive behavior is preserved. Task responses add
  readiness/pause and string revision; existing grants never gain execution scopes.
- No particular client, model, external process runner, webhook or push subscription
  is implemented. Clients poll and run their own work.
- The UI refreshes on opening, saved actions and its Refresh control; no polling
  timer is added. Attachments use existing authorized byte reads; interpretation
  and OCR belong to the external client.
- Claims/idempotency prevent duplicate Mokara executions, not duplicate external
  side effects. Clients must make their own external actions safe to retry.
- There is no automatic execution, retry, requeue or silent replacement of accepted
  instructions. Recovery after unknown outcomes always requires explicit approval.
