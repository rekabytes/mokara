ALTER TABLE github_account_connections
  ADD COLUMN verification_retry_at TIMESTAMPTZ(3),
  ADD COLUMN credentials_encrypted TEXT,
  ADD COLUMN refresh_lease_id UUID,
  ADD COLUMN refresh_lease_until TIMESTAMPTZ(3);
ALTER TABLE github_account_connections ADD CONSTRAINT github_refresh_lease_pair
  CHECK ((refresh_lease_id IS NULL) = (refresh_lease_until IS NULL));
CREATE INDEX github_account_connections_status_verified_at_idx
  ON github_account_connections(status, verified_at);
