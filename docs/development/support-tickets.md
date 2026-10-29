# Embedded support tickets

Customers submit structured requests from a website’s Help page. Tickets appear
in **Support** in the selected Mokara workspace. There is no floating chat launcher
or live chat. The same form can be opened in an application-owned modal or linked
as a standalone page.

## Availability and allowances

| Plan    | Websites per owner | New tickets per UTC calendar month |
| ------- | -----------------: | ---------------------------------: |
| Free    |                  0 |                                  0 |
| Starter |                  1 |                                100 |
| Pro     |                  3 |                                500 |
| Ultra   |                 10 |                              2,000 |

Allowances are shared across all workspaces owned by an account. Existing tickets
remain readable and replyable after a downgrade or a reached limit. Pausing a
website stops new submissions without deleting earlier tickets. Configured
websites, including paused ones, count toward the website allowance. Owners can
edit an existing website instead of creating another. Self-hosted instances use
unlimited website/ticket allowances, with the same public-form protections.

Each ticket accepts up to three PNG, JPEG, GIF, WebP or PDF attachments, 3 MB each.
The files use the existing S3-compatible bucket and the owner’s shared storage
pool, including pending cleanup reservations. They also appear in mDrive as files
uploaded by the customer; only the workspace owner can manage customer uploads.
Moving or renaming a file does not remove the ticket association. Trashing or
permanently deleting it in mDrive removes customer download access. Trashed files
still count toward the ticket’s three-file allowance.

## Deployment settings

Apply migrations `20261017030000_support_tickets` and
`20261017070000_support_email_sender`, then deploy the matching frontend and backend. The normal deployment migration process owns this step.

Keep the existing `AUTH_PUBLIC_URL` set to the canonical frontend origin for this
deployment. Installation snippets and private links use this runtime value;
there is no hardcoded Mokara deployment hostname or second public URL setting.

Set these **backend-only** values, documented in `packages/backend/.env.example`:

- `SUPPORT_EMAIL_API_URL`: the HTTPS send-email endpoint from the email provider’s
  documentation. The integration follows the [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email).
- `SUPPORT_EMAIL_API_KEY`: a sending credential for that provider.
- `SUPPORT_EMAIL_FROM`: a mailbox on a domain verified with the provider. A bare
  address or an existing `Display name <address>` value is supported; the configured
  mailbox remains the sending address.
- `SUPPORT_ENCRYPTION_KEY`: generate a separate 32-byte key using
  `openssl rand -base64 32`. Preserve it when rotating `AUTH_SECRET`; it protects
  ticket capabilities and queued email content. Back it up with other secrets.

The frontend needs no new environment variables. Existing `BACKEND_URL` and
trusted client-IP forwarding must be configured normally. Production requires a
strong backend `AUTH_SECRET`, matching backend/frontend `AUTH_PROXY_SECRET` and
correct trusted edge client-IP header configuration. Untrusted browser-supplied
IP headers are not accepted. Public write requests are limited by peer and site;
Redis outages fail closed. Missing email/key/public-URL configuration disables new
website setup and ticket submission, while existing tickets remain readable.

Hosted production also requires the existing Turnstile settings. The challenge
runs inside the Mokara-hosted iframe using the `support` action, so allow the
Mokara frontend hostname in Turnstile, not every customer's website hostname.
Development/self-hosted can opt into the existing Turnstile configuration.

## Install on a website

1. Open the intended workspace’s **Support** page.
2. The workspace owner adds a website name, exact allowed HTTPS origins, accent
   color and introduction. Origins have no paths, credentials or wildcards;
   HTTP localhost origins are supported for development.
3. Expand the saved website and copy its iframe snippet into the website’s Help
   page. The host site's CSP must allow the discovered form origin in `frame-src`.
4. Preview the form and submit a test request from the allowed website.
5. Open the confirmation email and check the ticket in the workspace inbox.

Only public form pages allow embedding, restricted to that website’s configured
origins. Private ticket pages and the signed-in application remain frame-blocked.
An allowlisted origin is a browser embed restriction, not a secret credential;
submission protection also relies on server-side rate limits and verification.
Do not publish a Mokara API token or a private ticket URL in installation markup.

The supplied iframe uses a fixed scrollable height to keep installation simple;
the host can adjust its width/height for its own layout. No third-party cookies
are required. The ticket page opens in a new tab from the confirmation screen.

## Customer and team workflow

Customers receive a reference and a private ticket link, with no Mokara signup.
Tokens live in URL fragments and API Authorization headers, never URL query
strings or browser storage. The pages are noindex, no-store and no-referrer.
Private links expire after 90 days; a deliberate team reply or status update after expiry renews
the link in its email. Anyone with a valid private link can access that ticket,
so treat it like a credential. Contact details are customer-supplied and must not
be treated as proof of identity for sensitive account requests.

Teams can assign members of the same workspace, change priority/status and add
public replies or private notes. Public replies set **Waiting for customer**;
customer replies reopen the ticket. Internal notes never appear in customer
responses or customer emails. Refresh the inbox to see new submissions/replies;
new submissions and customer replies also create an owner notification.
Messages and ticket lists are paginated with explicit load-more controls. Search
and status filters apply to loaded tickets and are labeled accordingly.

Creating a linked task is an explicit, repeat-safe action. It copies the subject,
request details and ticket reference, not contact fields or internal notes. Teams
can then explicitly choose one of their connected GitHub repositories and publish
the task as an issue through the existing GitHub integration. Review the task
contents before sharing customer-provided text with GitHub.

## Email and failure behavior

Confirmation and reply emails are queued transactionally with the ticket/message.
The sender display name uses the website name: **Northline Support via Mokara**, for
example. A website named **Northline Support** keeps that suffix once. The real
mailbox always comes from Mokara's `SUPPORT_EMAIL_FROM`; customers do not provide
SMTP credentials or authorize another sending address. Names are sanitized and
quoted, and the full sender is saved with the queued message so changing a website
name or sender setting does not change an in-flight retry's provider payload.
Older queued messages without a sender snapshot retain the configured fallback.
The worker sends text-only mail with a stable provider idempotency key, retries
bounded failures and discards queued work for removed tickets. Delivered private
content is removed from its queue row. Attempts stop before the provider's
24-hour idempotency window expires; exhausted deliveries remain **Failed**, never
reported as sent. The inbox shows **Queued**, **Sent** or **Failed** for the latest
customer email. Provider responses and credentials are not shown to customers.

Emails direct customers to their private ticket page to reply. Inbound email
replies are not implemented. Upload failures do not undo an already-created
ticket: the confirmation offers attachment retry without creating another ticket.
Unknown upload outcomes use a stable upload ID; durable reservations retain their
charged bytes until cleanup succeeds.

## Verification

Run `pnpm --filter @mokara/backend test:support` and the frontend regression suite
from `docs/CONTRIBUTING.md`, plus normal typecheck/lint/format gates. Tests isolate
provider/storage/DB boundaries and do not contact deployed services.

After deployment, test an actual embed from an allowed origin and rejection from
another origin; desktop and narrow mobile layouts; confirmation email/private
link; staff assignment, public reply and private note; customer follow-up;
attachment download/failure recovery; and linked task/GitHub issue creation.
Confirm production proxy headers preserve the form-specific frame policy and
private pages remain unframeable. Live browser/email delivery acceptance is a
separate check from local automated tests.

## Website setup and color preview

The owner’s Add/Edit website form includes a three-step setup guide, brand accent
and button text color pickers, editable hex values, presets and an inline customer
form preview. The preview shares request/contact fields with the real form and is
inert: it does not submit tickets, upload files or run email delivery. After saving,
the saved website opens its generated embed instructions. Copying advances the
instructions to testing; it does not report installation or a test ticket as complete.

Apply migration `20261029093000_support_button_text_color` with the matching backend.
The nullable `support_sites.button_text_color` column is exposed as optional nullable
`button_text_color` in the site/config API. Omission preserves the setting on updates
for older clients; explicit null selects automatic contrast. A custom six-digit hex
color is used exactly as chosen. The editor shows the pair’s contrast ratio and a
warning below 4.5:1. Automatic mode uses white text and darkens very light backgrounds
when necessary. The real customer form and preview use the same color helper.
No new environment variables or email provider settings are required.
