-- PRD-06 §3.2: the invariant is "every user has a personal workspace".
-- Signup creates one for new accounts; this backfills accounts that predate
-- it (e.g. seeded users who only ever had a pending invitation and therefore
-- no team_members row). Slug is per-user unique to avoid colliding with the
-- existing "personal" / "personal-2" rows.

WITH lonely AS (
    SELECT u.id AS user_id, gen_random_uuid() AS team_id
    FROM users u
    WHERE NOT EXISTS (
        SELECT 1 FROM team_members tm WHERE tm.user_id = u.id
    )
),
new_teams AS (
    INSERT INTO teams (id, name, slug, owner_id, kind, created_at, updated_at)
    SELECT
        team_id,
        'Personal',
        'personal-' || substring(user_id::text FROM 1 FOR 8),
        user_id,
        'workspace',
        now(),
        now()
    FROM lonely
    RETURNING id
)
INSERT INTO team_members (team_id, user_id, role, joined_at)
SELECT team_id, user_id, 'owner', now()
FROM lonely;
