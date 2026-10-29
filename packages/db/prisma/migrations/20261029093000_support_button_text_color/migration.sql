BEGIN;
-- NULL retains automatic contrast. Existing sites and older clients need no change.
ALTER TABLE support_sites ADD COLUMN button_text_color TEXT
 CHECK (button_text_color IS NULL OR button_text_color ~ '^#[0-9a-fA-F]{6}$');
COMMIT;
