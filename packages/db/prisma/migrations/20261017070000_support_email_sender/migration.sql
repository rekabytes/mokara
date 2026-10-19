-- Snapshot the branded sender so retries retain the same provider payload.
-- Existing queued emails retain the previous configured sender fallback.
ALTER TABLE support_emails ADD COLUMN sender TEXT;
