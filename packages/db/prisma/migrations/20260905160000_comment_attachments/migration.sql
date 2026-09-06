-- PRD-11 (comment attachments, owner 2026-09-05): files on COMMENTS, alongside
-- files on tasks. The same table now serves both: exactly one of the two owners
-- must be set (attachments_owner_check), the comment FK cascades with its
-- comment, and team_id stays denormalised so the workspace quota sum never has
-- to know which kind of file it is counting.
ALTER TABLE "attachments" ALTER COLUMN "task_id" DROP NOT NULL;
ALTER TABLE "attachments" ADD COLUMN "comment_id" UUID;

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "attachments_comment_id_idx" ON "attachments"("comment_id");

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_check" CHECK (
    ("task_id" IS NOT NULL AND "comment_id" IS NULL)
 OR ("task_id" IS NULL AND "comment_id" IS NOT NULL)
);
