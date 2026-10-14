-- Existing accounts keep their existing allowances. New registrations use the
-- owner-wide policy; renewals never change an existing account's policy.
ALTER TABLE users ADD COLUMN people_policy TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE users ALTER COLUMN people_policy SET DEFAULT 'account';
ALTER TABLE users ADD CONSTRAINT users_people_policy_check
  CHECK (people_policy IN ('legacy', 'account'));
