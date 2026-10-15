# Task and conversation read boundaries

Browser task and comment reads use chronological keyset pages. Each list endpoint
accepts `limit` (1–100, default100) and an opaque `cursor` query parameter. A query
reads at most `limit+1` rows; the extra row determines whether another page exists.
JSON shapes stay unchanged (task arrays and `{comments:[...]}`), with continuation
in the `X-Mokara-Next-Cursor` response header. No header means the final page.
Responses use `Cache-Control: private, no-store`.

Task order is descending `(created_at,id)`; comment order is ascending on the
same pair. Cursors carry the timestamp and ID rather than referencing a required
live row, so deletion of the last row does not break traversal. Cursors are bound
to the workspace/task and task status filter; malformed or mismatched cursors
return normal400 `invalid_input` envelopes. They are navigation hints, not access
credentials. Membership is checked on each request. MCP list tools already page
independently and keep their existing contracts.

The browser transport follows all pages, reuses the cancellation signal, preserves
filters, deduplicates IDs, and only publishes a completed collection. A failed,
malformed or cancelled continuation rejects the read through the unified error
path. Repeated cursors and empty continuation pages are rejected rather than
looped. Older backends without the header still work with the new frontend.

This bounds each collection query and HTTP response row count. It does not bound
the final browser list, individual legacy row sizes or nested relations, and does
not introduce board virtualization, hidden tasks, partial comment threads or a
load-more interface. Total loading cost still grows with collection size. Pages
are not one database snapshot: concurrent updates/removals may change later
pages, and new ascending comments can appear during a read. Existing board SSE,
refresh and mutation handling remain unchanged.

New task titles are limited to500 UTF-16 code units and descriptions to20,000,
matching JavaScript/Zod string length. Create and update schemas enforce the same
bounds; MCP writes reuse them. Comment bodies retain their existing2,000 limit.
The new-task form and inline editors show counts and keep over-limit drafts
editable. No maxlength attributes silently clip pasted content. Existing long
content is retained/readable; metadata-only edits still work, while replacing
content requires bringing that field within its limit.

## Deployment

Apply `20261016090000_collection_pages` before backend deployment, then deploy
matching backend and frontend together. It adds two non-unique chronological
indexes; it does not delete or rewrite user content. Index creation can hold
write locks on existing tables: schedule the migration for a suitable deployment
window on large instances. CI checks migrations from an empty database; do not
run migrations or start services locally against the owner's data for verification.

Deploy the new frontend before or together with the backend. An old frontend
against the new backend would read only the first page; do not leave that mixed
version combination serving traffic. Roll back the backend with the frontend
if needed; the additive indexes can remain.

Verify a workspace and conversation with over100 items after deployment: all
rows/replies visible, filters intact, changed membership rejected, failed reads
retryable, and task content errors clear. No new environment variables or
dependencies are needed. Tests use in-process Hono requests, fake database
boundaries, mocked browser fetches and isolated migration validation.
