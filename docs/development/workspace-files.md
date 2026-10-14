# mDrive — shared workspace storage

Phase 1 adds a private file library to each workspace, available from **mDrive** in the client navigation. It uses the current client typography, indigo controls and rounded surfaces.

## User behavior

- Create nested folders, rename and move items, and navigate using breadcrumbs.
- Upload multiple PNG, JPEG, GIF, WebP images or PDFs, with progress and individual retry. Drag and drop is supported on desktop.
- Browse in list or grid view, search throughout the current workspace, filter images/PDFs, and sort by name, size or date. File results are paginated in groups of 40; folders are shown separately.
- Preview images and PDFs, download privately, and see the uploader, date and size. PDF viewing uses the browser's native viewer; Download remains available if the browser cannot preview a PDF.
- Move items to Trash and restore within 30 days. Restoring to an unavailable parent places the item in the root. Restoring a folder restores only its own trash batch; independently trashed children stay in Trash.
- Upload queues belong to the current workspace page. Switching workspace or leaving the page cancels unfinished uploads; confirmed uploads remain available. Selecting files again creates a new upload; Retry retains the original upload identifier and destination.

## Sharing and storage

Every current workspace member can browse, upload, preview and download. Members can rename, move, trash and restore their own items; the owner can manage all items. A member cannot trash or restore a folder containing other members' items. Permanent deletion is restricted to the workspace owner and requires an item to be in Trash. Uploaded files belong to the workspace and remain when the uploader leaves; names are retained as snapshots if that user's account is removed.

Files, existing task/comment attachments, logos, Trash, upload reservations and pending object cleanup use the workspace owner's **one account-wide storage allowance**. Joining a workspace does not charge the member's account. Existing plan limits remain authoritative in `plans.ts`; creating more workspaces does not add storage. Over-quota accounts can still download, restore and remove existing files.

Images attached directly to tasks or comments have a fixed 3 MB per-file cap across all plans. PDF attachments and all mDrive uploads retain the workspace owner’s package-based per-file limit. Existing larger attachments are retained and remain downloadable.

Folders have a limit of 1,000 per workspace and 20 nesting levels. File formats are checked against actual signatures as well as MIME declarations; HTML and SVG are excluded. This is format validation, not a malware scanner or a guarantee about document contents.

## Architecture and reliability

- `frontend/app/(app)/files/` owns the page, directory, dialogs, preview, upload controller and pure folder helpers. Existing Jotai session/workspace selection is reused; ephemeral page state stays local.
- `frontend/lib/api.ts` shares its XHR upload transport with attachments. Responses cross the existing runtime schemas and unified error path. Obsolete directory reads and uploads are cancelled; a failed navigation does not display a previous folder's files under the new breadcrumb.
- `backend/routes/files.ts` checks membership on reads and again inside writes. Folder/file identifiers are scoped by workspace; composite database keys also reject cross-workspace folder references.
- Uploads reserve charged bytes under the owner's row lock, perform object-store I/O outside the transaction, and recheck membership, destination and current owner quotas before committing. A stable upload UUID plus content hash permits safe manual retry after a lost successful response. A pending upload returns a conflict until completion/cleanup.
- `backend/lib/file-cleanup.ts` runs within the existing backend process. It expires Trash periodically and drains durable object-deletion jobs. Jobs are claimed under the same owner lock, retried after failure and stopped during backend termination. Metadata deletion and cleanup enqueueing are atomic. Storage is released only after object deletion succeeds.
- Abandoned upload reservations expire after 15 minutes. Ordinary failures make cleanup immediately eligible; failed deletions retry after five minutes. A process crash leaves durable work for another running backend instance.
- Preview/download responses are private and uncached, with MIME/nosniff headers and single byte-range support. Only the authenticated same-origin preview path permits framing; other pages keep their frame restrictions. Public bucket links are never returned.

Uploads currently use the existing multipart proxy/backend buffering model. Deployment request-size limits, memory and timeouts must support the offered per-file sizes; this release does not add resumable or direct-to-bucket uploads. HTTP cancellation and durable cleanup reduce orphan risk but are not an exactly-once object-store guarantee. Backups and object-store lifecycle policies remain operational responsibilities.

## Deployment and verification

Apply migration `20261014090000_workspace_files` before the updated backend starts, and regenerate Prisma through the existing deployment pipeline. It creates folders, files and durable cleanup tables without modifying existing attachments. Deploy backend and frontend together for the new API/page. Existing `S3_*` settings and bucket permissions are reused; no new environment keys, public bucket access or separate worker service are required.

Validation includes isolated Hono authorization/upload/cleanup tests, API contract/upload transport/folder-view tests, fresh-checkout TypeScript, lint/architecture/format checks and an isolated chronological migration check. Sample-data layout previews cover 320, 390, 768, 1280, 1440, 1600 and 1920 pixels. These do not establish live backend or object-store acceptance.

Owner acceptance: create nested folders, upload several images/PDFs, navigate/search/filter/sort, preview/download on desktop and mobile, retry a failed upload, switch workspace during an upload, verify a second member's permissions, restore nested Trash and check shared owner usage across workspaces. Check private PDF rendering through the actual deployed proxy and object storage, including a larger document.

Phase 2 remains separate: attaching an existing library file to a task, version history, public sharing, folder-specific permissions, document editing and MCP library tools are not part of Phase 1.
