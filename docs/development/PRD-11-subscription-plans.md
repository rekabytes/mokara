# PRD-11 — Subscription Plans & Billing

> **Status: Phase 1 BUILT (2026-09-05, uncommitted — all gates green; the owner
> commits). Phase 2 not started — Stripe recon done 2026-09-06 (live account
> verified; §7 Phase 2 now describes the accepted Stripe shape; §6.1 still
> gates the processor).** Prices stay PROPOSED until §6.1/6.3/6.4 are signed
> (§6.2 currency DECIDED 2026-09-06: USD base). §7 notes have been corrected
> to describe the code as written, and the in-phase shape decisions the PRD
> reserved are recorded where they landed.

## 1. Model decision

**Open-core, hosted-paid.** Self-hosting (the GHCR images) stays free forever —
no license enforcement, no phone-home. Subscriptions sell the hosted instance:
we run it, back it up, keep it updated. This is the honest fit for what Mokara
is today and the fastest to ship (zero license machinery needed).

Pricing is **flat per workspace** (not per seat). Member caps pair naturally
with flat tiers; per-seat pricing would have no reason to cap.

## 2. Tier ladder (PROPOSED)

| Tier    | Price  | Members   | Workspaces        | Storage | Notes                 |
| ------- | ------ | --------- | ----------------- | ------- | --------------------- |
| Basic   | Free   | 3         | personal + 1 team | 1 GB    | current behaviour     |
| Starter | $4/mo  | 8         | personal + 3      | 10 GB   | small real teams      |
| Pro     | $9/mo  | 25        | personal + 10     | 50 GB   | growing companies     |
| Ultra   | $18/mo | unlimited | unlimited         | 200 GB  | API / MCP / audit log |

Storage (§5) is the third capacity axis beside members and workspaces.

**Currency (§6.2, DECIDED 2026-09-06): USD base prices.** The ladder is
international from launch, so prices are set in USD: US-market buyers pay
exact USD on USD cards (no conversion anywhere), everyone else's issuer
converts as it already does for global SaaS, and USD revenue matches our
USD-denominated infra costs — only profit crosses FX at payout (MY settles
MYR-only; multi-currency settlement is not offered in MY). Localization was
deliberately deferred: Stripe's guidance is that Adaptive Pricing needs the
price currency to match a settlement currency, so an RM-anchored base +
Adaptive Pricing (customers pay 100+ local currencies, 0% merchant fee, 2–4%
ridden in the customer's rate, subscriptions = cards/Apple/Google only —
compatible with §6.7) is the revisit path **if** non-US conversion data ever
justifies it. Manual `currency_options` per market: not before scale.

Rationale recorded in the brainstorm:

- **Free stays at 3** — it is already the DB-enforced behaviour (the
  `enforce_max_team_members` trigger) and 3 is enough for a real trio who will
  outgrow it. Lower kills word of mouth; higher gives away the cheapest
  conversion moment.
- **$2 was rejected** — Stripe fees (~30¢ + ~3%) eat ~18% of a $2 charge, and
  the price is too close to free to anchor value. Minimum sensible tier $3–4.
- **Workspaces count as the secondary axis** — otherwise a company shards into
  N free teams of 3.
- **Ultra "unlimited"** sells the end of thinking about limits; the tier's real
  monetization is its features (API, MCP, audit log), not seats.

Annual toggle (2 months free) agreed as a later addition, not launch-blocking.

## 3. Enforcement model

- The hard 3-member **Postgres trigger is superseded** — a trigger cannot know
  the owner's plan. Enforcement moves to the backend invite route
  (plan check → friendly `team_full`-style 409). The trigger gets dropped or
  neutered in the billing migration.
- Entitlements live server-side: a plan lookup on the gated routes (invite,
  workspace create, future feature gates).
- **Downgrade = freeze, never delete.** A team over its new cap keeps working
  read/write; only _new_ member joins are blocked until back under the cap.
  Data is never removed by a downgrade.

## 4. Feature adds → Free & Starter (settled 2026-09-05)

Pro and Ultra feature sets are deferred — decided once Starter is live.

**Baseline:** Free keeps everything that exists today — tasks, comments,
notifications, projects/KPIs, 14-day analytics, 3 members. Nothing existing is
ever taken away or gated.

### Free — what we add

- **Subtasks / checklists** — tasks are flat today; the biggest product gap.
- **Basic due-soon banner** — in-app, computed on load from existing data;
  no scheduler, no email. Makes due dates feel real.
- **Attachments, 1 GB** (§5) — ships on every tier; capacity is the gate,
  not the feature.
- **Polish queue** (§7 Phase 3, one at a time): global search · ⌘K command
  palette · duplicate task · calendar view · markdown descriptions.

### Starter — what we add

- **Capacity unlock:** 8 members · 3 workspaces · 10 GB attachments.
- **Workspace logo/icon** — per-workspace image, rides the attachment upload
  plumbing; Starter workspaces feel "theirs".
- **Priority support** — a promise from day one, zero build.

Standing rule: gate on new features and capacity only. Considered and rejected
for Starter (2026-09-05): guests/read-only members, saved filters/views.

## 5. Storage & file attachments (PROPOSED — first feature of the ladder)

Agreed in the 2026-09-05 brainstorm: attachments ship on **every** tier — the
feature is table stakes and must never be the paywall; **capacity** is the
upsell. Quotas are per workspace (the owner's plan pays for the team).

| Tier    | Total quota | Per-file cap |
| ------- | ----------- | ------------ |
| Basic   | 1 GB        | 25 MB        |
| Starter | 10 GB       | 100 MB       |
| Pro     | 50 GB       | 250 MB       |
| Ultra   | 200 GB      | 1 GB         |

- Market check: Trello 10 MB/file, Asana 100 MB total, ClickUp 100 MB total,
  Notion 5 MB/file — 1 GB free is already among the most generous. The owner's
  first idea (3 GB free / 5 GB starter) was revised: the free→starter jump must
  be 10× to be a reason to pay (1→10), and 3 GB free mostly attracts
  backup-drive abuse.
- **Per-file caps are the real abuse control**, more than totals — legit task
  use is screenshots (KBs) and documents (MBs); video gets capped out.
- **Over quota = freeze, never delete** (mirrors §3): uploads rejected,
  existing files stay downloadable.
- Infra: R2-style zero-egress object storage (S3-compatible API). At these
  sizes storage costs pennies; S3 egress fees are the thing that kills —
  avoid. Self-hosted instances point at their own S3-compatible bucket via
  env (open-core stays honest — no phone-home, no Mokara-side proxy).
- **KPI binding is personal (owner decision 2026-09-05, built):** a member may
  bind only KPIs they created — `bindingDenial` checks ownership and answers
  `kpi_not_owner` (403); PUT /tasks/:id/kpis preserves teammates' bindings and
  counts their weight into the ≤100 budget, replacing only the actor's own
  rows. The chip offers only the actor's KPIs; teammates' bindings stay visible
  on the task row and in progress math. Verified live (see .pi/memory.md).
- Build note: quotas need entitlements (§7 Phase 1.1) to check against, so
  attachments land after the entitlements step, not before.

## 6. Open decisions — and what each one gates

| #   | Decision                      | Options                                                                                                                                                                                                                                        | Gates         |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | Payment processor             | Stripe direct vs Stripe Managed Payments (MoR — MY eligibility unconfirmed, ask Stripe) vs third-party MoR (Paddle / LS)                                                                                                                       | Phase 2 only  |
| 2   | Currency                      | **DECIDED 2026-09-06: USD base prices** (global launch; localization deferred — see §2). The "RM + local methods" argument had already been retired by §6.7; reversible later via an RM-anchored base + Adaptive Pricing or `currency_options` | —             |
| 3   | Final prices + annual Starter | $4/$9/$18 PROPOSED                                                                                                                                                                                                                             | Phase 2 only  |
| 4   | Trials                        | e.g. 14-day Pro trial, or none at launch — config-cheap on the Stripe track (`trial_period_days` / Checkout trial setting), not a build                                                                                                        | Phase 2 only  |
| 5   | Grandfathering sentence       | recommended default below                                                                                                                                                                                                                      | **Phase 1.1** |
| 6   | Plan holder                   | on the user vs on the workspace                                                                                                                                                                                                                | **Phase 1.1** |
| 7   | Subscription payment methods  | **DECIDED 2026-09-06: recurring-capable methods only — cards + Link. FPX and GrabPay are not used for subscriptions** (Stripe docs verified: both are single-use, excluded from Checkout subscription/setup mode)                              | Phase 2       |

- **§6.5 recommended default:** caps are enforced at join/create time only;
  existing over-cap state freezes (§3 rules). Nobody loses access to anything
  they already have.
- **§6.6 recommended default:** plan lives **on the user**; a workspace's
  tier = its **leader's** plan; the workspace-count cap counts team
  workspaces the user leads. One checkout per account, and "personal + N
  workspaces" falls out naturally. A per-workspace plan would mean paying
  twice for two workspaces and fights the ladder design.
- Phase 1 can start without decisions 1–4. Only 5 and 6 gate code.

## 7. Development plan — phase by phase

Dependency map: **Phase 0 → Phase 1 → Phase 2**; **Phase 3 runs parallel any
time**. Inside Phase 1 the order matters: 1.1 before 1.3, 1.3 before 1.4.
Every phase = small features, one commit each, gates green before done (§8).
Touchpoints use the repo's real paths.

### Phase 0 — decisions (no code, unblocks everything)

Output: a "Phase 0 decisions" block appended to this PRD — value + date each.

- [ ] Processor chosen (§6.1) — Stripe account recon DONE 2026-09-06 (live,
      MY, recurring-proven; see Phase 2 header) — remaining: decide direct vs
      Managed Payments (confirm MY eligibility with Stripe) vs Paddle/LS.
- [x] Grandfathering sentence approved (§6.5 default, adopted 2026-09-05).
- [x] Plan holder model confirmed (§6.6 default, adopted 2026-09-05).
- [x] Subscription payment methods decided (§6.7, owner 2026-09-06): recurring
      methods only — cards + Link; FPX/GrabPay not used for subscriptions.
- [x] Deploy-mode signal chosen: `DEPLOY_MODE` (default `self_hosted` =
      unlimited), deliberately not derived from any payment credential.
- [x] Currency confirmed (§6.2, decided 2026-09-06: USD base prices).
- [ ] Final prices confirmed (§6.3).
- [ ] Trial policy: pick now or explicitly "none at launch".

### Phase 1 — the floor (billing can't exist without these)

**1.1 Entitlements**

- Goal: the server knows every account's plan and enforces the caps.
- DB: migration adds `plan` to users (TEXT + `users_plan_check`, default
  free — plain string + CHECK is this schema's convention, there are no Prisma
  enums) and drops the `enforce_max_team_members` trigger. Billing fields
  (grace_until, period_end) wait for Phase 2.
- Backend: `lib/entitlements.ts` — denial-shaped checks (`joinDenial`,
  `teamCountDenial`, `memberLimitForPlan`) reading caps from `lib/plans.ts`, the
  one tier→caps table; container-scope's `{status,error,message}|null` shape so
  no helper needs a Hono Context. Self-host mode: `DEPLOY_MODE=self_hosted`
  (the default) → every account reads unlimited and billing routes stay
  unmounted (open-core, zero phone-home). Create-team, invite AND accept all
  check; accept re-checks inside a transaction behind a `FOR UPDATE` lock on the
  team row, which is what keeps two simultaneous accepts from both fitting
  (the trigger's old job). Answers: `team_full` (cap of the leader's plan),
  `workspace_limit` (§6.6), plus `member_limit` + `has_logo` on team responses.
- Frontend: new codes mapped in `lib/errors.ts`; ContainerSwitcher surfaces
  the workspace-limit error.
- Done when: a 4th invite on a free-led workspace 409s with friendly copy; a
  team create beyond the cap 409s; a self-host instance ignores all caps.

**1.2 Subtasks**

- Goal: checklists inside a task.
- Shape decision (BUILT): **flat `subtask_items`** (task_id FK cascade, title,
  done, position) — not child tasks; recursion and per-item assignment stay
  out. No `author_id`: a checklist is task content, so any member may edit it
  (like the title), and items carry no ownership claim. There is **no GET list
  route** — the checklist is embedded in every task response and the drawer
  renders the array it was given.
- API: items embedded in task responses; POST/PATCH/DELETE item routes
  (member-of-container authorisation, mirroring comments).
- Frontend: checklist block in the task drawer; done-count chip on the row
  if cheap.
- Done when: add / check / uncheck / delete / reorder persists across
  reloads.

**1.3 Attachments + storage quota**

- Goal: files on tasks, counted against the workspace quota.
- Infra: S3-compatible bucket via env (endpoint/bucket/keys). Unset in
  self-host → uploads answer `attachments_disabled`, friendly error; nothing
  else degrades.
- Flow (BUILT — this is §7's documented fallback, promoted because the
  recommended path was blocked here): **proxy both directions** through the
  backend. Presigned PUT would need `connect-src` opened to a bucket origin
  that is a per-deployment RUNTIME value (our CSP is enforced
  `default-src 'self'`), a CORS rule every self-hoster must remember, and a
  lifecycle rule for objects uploaded but never confirmed. Downloads ride
  `GET /attachments/:id/download` (a navigation, so CSP does not apply) and
  always carry `Content-Disposition: attachment` — an uploaded HTML file can
  never render under our origin. Bodies are held in memory only for the length
  of a request, bounded by the plan's per-file cap. Row is written AFTER the
  put succeeds: a failed insert orphans an invisible object, a failed put
  leaves nothing listed.
- DB: `attachments` — task FK cascade, workspace_id denormalised (quota
  sums), uploader_id, filename, size_bytes, content_type, storage_key,
  created_at.
- Rules: quota summed by `lib/quota.ts` (task files **plus** the container
  logo — see 1.4, otherwise the logo escapes the quota it is billed into);
  over quota → `quota_exceeded`, uploads rejected, files never deleted;
  per-file cap → `file_too_large`; **delete = uploader ONLY** (owner decision
  2026-09-05 — "only owner of the image can delete it", superseding the
  payer-cleanup rationale; verified live: two non-uploader members got 403,
  the uploader got 204). Accepted consequence: if an uploader later leaves the
  team, nobody can remove their file — the quota cap still bounds total
  exposure.
- Frontend: drawer attachments block — upload (press or drop), progress,
  list with size, download, delete.
- **Comment attachments (owner iteration, built 2026-09-05):** files can ride on
  COMMENTS as well as tasks — `attachments` gained a nullable `comment_id`
  beside a now-nullable `task_id`, with `attachments_owner_check` enforcing
  exactly-one-owner; `team_id` stays denormalised so the quota sum never
  changes. `storageKey` gained a scope segment
  (`teams/<team>/{tasks|comments}/<id>/<file>`). **Comments accept images and
  PDFs only** (`unsupported_type` otherwise — the owner's allowlist; task
  uploads stay type-agnostic, an asymmetry the owner chose); **a comment still
  needs text alongside its files** (the two-phase create→upload flow can't
  enforce "body or file" atomically; image-only comments would need multipart
  comment creation — later). Files embed in every comment response. Deletion is
  uploader-only (inherited), and deleting a comment or task now purges its
  stored bytes best-effort — that orphan leak existed for task files already
  and is closed for both. Verified live: png/pdf 201, txt/exe 400
  `unsupported_type`, non-uploader delete 403, comment delete → file 404,
  task delete → attachments 404 (fully self-cleaning probe).
- Done when: upload→download round-trips; the quota math blocks the Nth GB;
  a self-host instance without bucket config degrades gracefully.

**1.4 Workspace logo/icon**

- Goal: per-workspace image — the visible Starter perk.
- BUILT: `teams.logo_key` / `logo_bytes` / `logo_type` (three columns, not an
  attachments row: a logo has no uploader-visible history, exactly one object
  per workspace, and hangs off the container not a task). `logo_bytes` exists
  so `lib/quota.ts` can honestly count it against the workspace's storage.
  `has_logo: boolean` on team responses (not a URL — the client builds
  `/api/teams/:id/logo`), leader-only PUT/DELETE, served `no-cache` so a
  replaced logo shows on the next load.
- Reuses 1.3's plumbing (`putObject`/`getObjectBytes`/`deleteObject`) but not
  its table. Frontend: `ContainerIcon` in the switcher (logo over kind glyph)
  - `LogoCard` at the head of the team page's right rail — deliberately NOT in
    the breadcrumb bar, which stays a verbatim copy app-wide (§8 house rule).
- Done when: leader sets and removes it; members see it everywhere the
  workspace is named.

**1.5 Basic due-soon banner**

- Goal: due dates feel real without a scheduler.
- Backend: **persistent rows** in the `notifications` table — one row per
  matching task per user, type `due_soon`. Same 48h horizon, same exclusion
  of `done`/`canceled`. No cron, no email. Rows are produced by
  `regenerateDueSoonFor[User|Team]` in `lib/notifications.ts` and hooked
  into: `createTask`, `PATCH /tasks/:id` (status / due_date / assignee),
  `DELETE /tasks/:id`, accept-invite, and once per session-start on
  `GET /notifications` (the safety net for missed updates between requests).
- Frontend: rendered through the same notification feed as the rest of
  PRD-05 — bell badge surfaces the unread count, drawer rows are deep-links
  into the task drawer (same `setSelectedId` + `router.push("/tasks")` pattern
  as the other types). Overdue rows use a red icon, coming-up rows use amber;
  body reads "<task> is overdue" / "<task> is coming due". Dismissal is
  mark-read, which persists across devices and sessions (the per-tab Jotai
  dismissal that the Phase 1.5 banner used is gone with the banner).
- Why the move: the page-top strip was an attention surface that competed
  with the board and lived on /tasks only; the same set belongs in the
  single notification surface, where it gets the bell badge for free and
  the same persistence as the rest of the feed. No new migration needed —
  the notifications table already accepts arbitrary string types.
- Done when: every overdue + ≤48h task surfaces as a `due_soon` row in the
  drawer (with the right icon + body), status / due_date / assignee / delete
  mutations keep the set honest, and accept-invite fills in the new member's
  cross-team view; zero timers, zero background jobs.

### Phase 2 — money (gated on the Phase 0 processor choice)

Recon done 2026-09-06 against the live Stripe account (Rekabytes Enterprise,
MY, MYR default, charges + payouts active, two monthly MYR subscriptions
already running for another product — recurring billing on this account is
proven). The shape below is the recommendation Stripe's own integration
planner accepted for Mokara; it is the STRIPE track — re-derive the specifics
if §6.1 lands on Paddle/LemonSqueezy.

**2.1 Plans config** — `lib/plans.ts` stays the single source: tier → caps +
price references. Prices are USD (§6.2). One Product per paid tier; every
Price carries a `lookup_key` (e.g. `starter_monthly`) so tier→price maps
through env without hardcoding generated IDs. Annual = a second price per
Product later (2.5). Payment methods: cards + Link only (§6.7).

**2.2 Checkout** — `POST /teams/:id/billing/checkout` (leader-only) creates a
Stripe-hosted **Checkout Session in `subscription` mode** (redirect; zero
billing UI; no card data touches our server) with `user_id`/`team_id` in the
session metadata. The client redirect **never** grants the plan; only webhooks
write entitlements.

**2.3 Lifecycle webhooks** — public, signature-verified route; the ONLY writer
of `users.plan`. Event set: `checkout.session.completed`,
`customer.subscription.created/updated/deleted`, `invoice.paid`,
`invoice.payment_failed`. Failed payment = grace period, then
downgrade-freeze per §3 (never delete). One migration adds the billing fields
on the user (`stripe_customer_id`, `grace_until`, `period_end`).

**2.4 Billing portal** — Stripe **Customer Portal** (no-code): upgrade,
downgrade, cancel-at-period-end, change card, promo codes — all Stripe-hosted;
proration is handled by flexible billing mode (Stripe's default). One
leader-only endpoint returns a portal link; we build no billing screens.

**2.5 Annual toggle** (§2, 2 months free) — second price per tier, switch at
renewal. Only after launch is stable.

**2.6 Priority support** — a promise, not code: support inbox + response
expectation published on the landing page and settings the day Starter
switches on.

**2.7 Revenue recovery** — zero code: Smart Retries + automated failed-payment
emails + automatic card updates, all Dashboard settings; the webhook still
surfaces `invoice.payment_failed` for our grace/freeze mapping.

**2.8 Tax** — Stripe Tax free threshold monitoring + a product tax category on
Mokara products (no registrations on the account today). Whether/when to
register for Malaysian digital-services tax is an accountant question, not
code.

### Phase 3 — free polish (never blocks billing; one at a time)

1. **Global search** — `GET /search?q=` over tasks (and comment bodies if
   cheap) across the user's workspaces; ILIKE first, pg_trgm when it gets
   slow.
2. **⌘K command palette** — overlay shell: jump to workspace, jump to task,
   quick-create task; wired to 3.1's results.
3. **Duplicate task** — server-side copy endpoint; button in the drawer.
4. **Calendar view** — month grid of tasks by due date; local-midnight day
   math per house rule.
5. **Markdown descriptions** — render task and comment bodies, sanitised.

## 8. How this plan runs (process rules)

- One commit per feature, staged by path; the owner commits and pushes.
- The owner runs dev servers; agent never does.
- Every new error code lands in `lib/errors.ts` ERROR_RULES — one error map.
- Migrations are hand-written (`migrate dev` hangs interactively); verified
  with `db:migrate:deploy` against the dev Postgres.
- Gates before done: `pnpm typecheck` · `lint` · `format`; fresh-checkout
  typecheck for asset/routing changes (the next-env.d.ts dance).
- CI is the feedback loop — no local builds, ever.
- Phase 1 features ship to production before Phase 2 exists: nothing
  user-visible depends on billing until Starter switches on.

## Phase 0 decisions (recorded 2026-09-05, development started)

| #   | Decision                     | Value                                                                                                                                                                                                                                                            | Basis                                              |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 5   | Grandfathering               | Enforce at join/create time only; existing over-cap state **freezes** (§3) — nobody loses access to anything they already have                                                                                                                                   | §6.5 recommended default, adopted                  |
| 6   | Plan holder                  | **On the user.** A workspace's tier = its **leader's** plan; the workspace-count cap counts `kind='team'` workspaces the user leads                                                                                                                              | §6.6 recommended default, adopted                  |
| 7   | Subscription payment methods | **Recurring-capable methods only: cards + Link. FPX and GrabPay are NOT used for subscriptions** — verified in Stripe docs 2026-09-06 (both single-use, excluded from Checkout subscription/setup mode), so the restriction is also the platform's own behaviour | owner decision, 2026-09-06                         |
| new | Deploy-mode signal           | `DEPLOY_MODE` env: `hosted` \| `self_hosted` (**default `self_hosted`**). Caps enforce only when `hosted`; `self_hosted` reads unlimited everywhere and billing routes stay unmounted                                                                            | processor-agnostic — must not depend on decision 1 |
| 1   | Processor                    | **open** — Stripe direct vs Stripe Managed Payments (MoR; MY eligibility unconfirmed) vs Paddle/LS; gates Phase 2 only                                                                                                                                           | —                                                  |
| 2   | Currency                     | **DECIDED 2026-09-06: USD base prices** — global launch anchor; MYR/Adaptive-Pricing localization is a data-driven revisit, not a launch requirement (§2)                                                                                                        | owner decision, 2026-09-06                         |
| 3   | Final prices                 | **open** — PROPOSED $4/$9/$18 stands until confirmed; gates Phase 2 only                                                                                                                                                                                         | —                                                  |
| 4   | Trials                       | **open** — "none at launch" is the working assumption; config-cheap if yes (2.1–2.3 recon); gates Phase 2 only                                                                                                                                                   | —                                                  |

Two implementation conflicts found during recon and resolved here:

- **§7 1.5 said `localStorage` for banner dismissal — rejected.**
  `/cookie-policy` publicly states "`localStorage` / `sessionStorage` — not
  used" and the codebase has zero calls. Dismissal is a Jotai atom in
  `lib/tasksView.ts` (per-tab session), which keeps the published privacy
  claim true.
- **§7 1.1 scope widened by one line:** `team_full`'s copy in
  `frontend/lib/errors.ts` hard-codes "3 members maximum" and
  `/teams/[id]` renders a literal `/ 3`. Both become lies the moment plans
  exist, so they are part of the entitlements commit, and team responses gain
  `member_limit`.

Note for Phase 1 verification: nothing in Phase 1 lets a user _buy_ a tier —
`plan` is written only by Phase 2 webhooks. So on a `hosted` deployment every
account is `free` and the caps are the free caps; exercise them locally by
setting `DEPLOY_MODE=hosted` in `packages/backend/.env`.
