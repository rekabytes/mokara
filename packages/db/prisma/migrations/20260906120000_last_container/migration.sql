-- Owner (2026-09-06): remember each user's last selected container
-- server-side, so refreshing /tasks restores "where you work" instead of
-- falling back to the newest workspace. This is deliberately SERVER state,
-- not device storage: the cookie policy's "no localStorage" promise stays
-- true, and the pick follows the user across tabs and devices.
ALTER TABLE "users" ADD COLUMN "last_container_id" UUID;

-- A deleted container must not take the user's row with it, and must not
-- leave the pointer at a dead id: clear it. (GET /teams additionally filters
-- the value against live membership, so a left-but-not-deleted team can
-- never be restored either.)
ALTER TABLE "users" ADD CONSTRAINT "users_last_container_id_fkey" FOREIGN KEY ("last_container_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
