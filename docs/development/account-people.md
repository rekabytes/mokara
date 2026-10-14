# Owner-wide people allowance

Under the new policy, hosted paid plans include Starter 8, Pro 25 and Ultra 50 unique people, including the owner, across all workspaces the account owns. Count distinct user IDs from current memberships joined through workspace ownership, union the owner ID. Personal-kind containers count too. Joined workspaces owned by somebody else use that owner's pool. There is no guest exception.

Free retains its existing three-member per-workspace ceiling and one-team cap. Self-hosted remains unlimited. Paid team-workspace caps remain Starter 3, Pro 10 and Ultra 20; storage and file limits are unchanged. Pro/Ultra checkout remains unavailable; their finite capacities also apply to operator grants.

## Legacy accounts and new purchases

Migration `20261014120000_people_policy` marks every existing user `legacy`, then changes the database default to `account` for all future registrations, including password and social registration. Legacy users retain per-workspace membership ceilings; legacy Ultra retains unlimited members and team workspaces. The owner policy applies regardless of which teammate sends or accepts an invitation.

Existing same-tier subscription renewals and payment recovery keep legacy policy. New Checkout subscriptions carry `people_policy=account` in server-written subscription metadata. A verified mapped paid subscription with that marker, or a change from one paid tier to another, switches the account permanently to the new policy. Canceling/downgrading never restores legacy. Operator grants alone do not change the account policy. Pro/Ultra remain unavailable for purchase; their capacity resolver is ready for future mapped tiers. New account policy on Free still preserves Free's existing per-workspace limits.

Settings identifies legacy paid allowances. The pricing FAQ explains the transition. Existing memberships remain untouched even if a new purchase puts the account above its new cap.

## Invitation behavior

The send route checks the named invitee against the owner's pool for a friendly early error. Pending invitations do not reserve places. Acceptance is authoritative: a READ COMMITTED transaction locks the owner row, then workspace and invitation, reloads invitation status/expiry and current plan/usage, then adds membership and promotes a personal container atomically. Accepts in different owned workspaces serialize on the same owner. Creating a team takes the same owner lock and rechecks the team cap, preventing a create/promotion race.

An existing collaborator consumes no new place even when an account is full or already over its ceiling. New distinct people receive the existing typed `team_full` conflict with an account-specific explanation. Existing memberships are never removed or hidden. Removing a membership frees a place only if it was that person's last membership in any workspace owned by the account. The owner always consumes one place.

The legacy `member_limit` wire field remains for compatibility. Team detail also returns `people: { scope, used, limit }`; billing returns the same shape, with null usage for per-workspace plans. Frontend validation accepts the new fields optionally during rolling deployments. Settings shows paid owner-wide usage; workspace detail shows local member count separately from the owner's shared usage and permits inviting existing collaborators at capacity. Pricing labels and FAQ describe the model, invitation timing and grandfathering.

## Example

Starter: owner plus seven collaborators across three teams uses 8/8 places. The same eight people can belong to every team. A ninth distinct person cannot join. Removing one person from one team does not free a place if they remain in another owned workspace.

## Validation and deployment

Apply the people-policy migration before deploying the updated backend; deploy the matching frontend for the updated labels. No new environment variable. Prisma client regeneration is required as usual. Isolated tests cover distinct identities, ownership scope, owner inclusion, removal, overrides, grandfathering, Free behavior, promotion limits and concurrent acceptance in different teams. These transaction tests simulate lock serialization; live Postgres/browser acceptance remains an owner-run deployment check.

Manually verify two invitees accepting into different owned teams when exactly one place remains, existing teammates joining at capacity, an over-cap existing account retaining access, and Free/self-hosted behavior. Memory is not implemented by this change.
