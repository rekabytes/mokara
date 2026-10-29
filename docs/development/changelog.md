# Dashboard release notices

Both signed-in dashboards read `GET /api/changelog`. The backend owns the curated
release entries in `packages/backend/src/routes/changelog.ts`. The admin console
proxies this read through its existing authenticated server boundary. The feed
contains public product copy and requires no credentials, database or new env
settings. It must never contain security findings, infrastructure details,
credentials or private customer information.

Add new entries at the beginning of `releases` when a version is ready to ship.
Use the actual version, release date, title, short summary and user-facing changes.
Keep earlier entries to build the readable history. This is a curated changelog,
not an automatic export of commits or issue descriptions. It follows the backend
version installed on that instance, so deploy matching application images.

The client shows a compact bottom-right notice for the newest entry. Clicking it
opens a native modal with the history. X closes only the notice; ignoring it for
30 seconds hides it. Opening the notice also dismisses that release notice.
The timeout never closes an open modal. Escape, its close button or the backdrop
closes the modal. The admin console uses the same timed corner notice and native modal, styled for
its operator interface. The client's What's new sidebar button and the admin masthead
button reopen the notes. Dismissal is a browser preference, not a notification
read receipt: it does not synchronize between devices. Client preferences are
keyed by signed-in user and exact release version. The operator console stores
its preference for that browser. A different release appears again. Blocked
storage does not prevent reading or closing the notice.

The notice is separate from customer notifications and does not alter their unread
counts. Loading failures can be retried from What's new without blocking tasks or
operator data. There is no forced modal, automatic task mutation or analytics.

Checks: backend `node --import tsx --test test/changelog.test.mjs`; frontend from
backend `TSX_TSCONFIG_PATH=../frontend/tsconfig.json node --import tsx --test
../frontend/test/changelog.test.mjs`. Existing API contract tests also cover the
new transport operation.

## Historical releases

The initial history includes all 28 published stable Git tags through v0.2.18,
verified against the repository tag inventory on 29 October 2026. There is no
published v0.2.2 tag. Historical dates use the tagged commits, and summaries were
curated from the changes between successive tags. No raw commit messages or
internal issue details are sent to the dashboard.

Both modals list every release with its version, date and product summary. The
latest entry starts expanded; older entries use native keyboard-operable details
with outlined chevrons. The history scrolls inside the modal.

Version 0.2.19 introduces these notices and the backfilled history. New release
entries are added at the top of the same catalog.
