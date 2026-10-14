# mDrive through MCP

Six tools extend the existing authenticated MCP server:

| Tool                  | Required scope        | Behavior                                                                   |
| --------------------- | --------------------- | -------------------------------------------------------------------------- |
| `list_drive_items`    | `mokara:drive:read`   | Browse active folder/file metadata; separate file and folder pagination    |
| `search_drive_items`  | `mokara:drive:read`   | Search names across the authorized workspace, optionally by image/PDF type |
| `get_drive_file`      | `mokara:drive:read`   | Read file metadata, with no bucket keys or public download links           |
| `read_drive_file`     | `mokara:drive:read`   | PDF page text, native MCP image content, or bounded base64 byte chunks     |
| `create_drive_folder` | `mokara:drive:upload` | Create a folder, optionally nested, using existing folder limits           |
| `upload_drive_file`   | `mokara:drive:upload` | Upload actual PNG/JPEG/GIF/WebP/PDF bytes via the normal mDrive route      |

All tools require the existing base `mokara:read` connection scope. Drive permissions are separate from task-write/deletion/GitHub permissions and from each other. Existing grants are unchanged; reconnect with explicit approval or create a new scoped manual connection. OAuth access/refresh tokens cannot widen approved grants. Settings and consent expose the new permission descriptions. Workspace allow-lists and current membership apply on every call; Trash is excluded. There are no mDrive move/delete tools in this release.

## Content and transfer limits

- Native image response: up to 1 MiB. Model/client support for image content is required to understand the image.
- PDF text extraction: source up to 10 MiB, at most five pages per call, 16,000 characters total per response. Follow `next_page`; follow each page's `next_text_offset` with that single page and `page_count=1` for remaining text. Empty text can indicate scans; no OCR or page rendering is performed.
- Raw file reading: `mode=bytes`, chunks up to 64 KiB. Follow `next_offset` and reconstruct bytes in order; this supports larger existing files without buffering the whole object in one response.
- MCP upload: non-empty and up to 1 MiB decoded; base64 must fit the existing 2 MiB MCP request limit. Use the web app for larger uploads. Package-based mDrive web-upload limits and owner account quotas are unchanged.

PDF extraction uses pdf-parse/PDF.js in a Node worker thread, with a 15-second deadline, V8 heap limits and two concurrent readers per backend process. Workers accept only downloaded bytes, not agent-supplied URLs, disable eval/font rendering, return bounded page text and terminate after completion/failure. Worker threads are resource/lifecycle isolation, not an operating-system security sandbox; native allocations are not fully covered by V8 heap limits. Encrypted/malformed PDFs and out-of-range pages return safe errors. No document text, file bytes, secrets or bucket keys enter application logs.

File contents, filenames and extracted text are untrusted data, never agent instructions. Tool/server descriptions and downloadable skill guidance state this explicitly. Upload descriptions prohibit fabricated content and silent destination changes. Native image content stays out of structured metadata so base64 is not duplicated in text.

## Writes and deployment

Writes use the existing durable MCP operation ledger and `request_id` rules. Same-ID/same-argument completed retries replay results; conflicting arguments fail, and pending/uncertain outcomes require activity inspection. The request ID also becomes the mDrive upload ID. In-process domain routing preserves MIME/signature validation, folder limits, owner-row-locked reservations and quota rechecks, attribution and cleanup. No remote URL fetch, credential disclosure or public bucket is added.

Migration `20261014100000_mcp_drive_permissions` expands allowed scope constraints on connections and OAuth tokens without changing existing rows/default grants. Apply through the normal backend startup migration pipeline. Deploy backend/frontend together; no new environment variables or bucket are needed. Backend adds the locked `pdf-parse` dependency and its transitive PDF.js/native canvas packages; CI owns container/build verification on Node24 Alpine. Local parser tests do not establish that container runtime acceptance.

Public `/docs/mcp` lists all47tools and the content limits. Downloadable Mokara skill is updated to1.1.0; users with a previously installed copy must update it themselves. The MCP connection does not silently install the skill.

Acceptance: reconnect with each drive scope separately and together; list/search nested folders, read a multipage/long-text/scanned PDF, view an image on a vision-capable client, read a larger file in chunks, upload to root/nested folders, replay one request ID, reject a changed payload, and verify revoked membership/unauthorized workspace/Trash denial and owner storage accounting.
