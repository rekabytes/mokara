-- PRD-11 Phase 1.3: files on tasks. team_id is DENORMALISED on purpose: the
-- storage quota is per workspace and is summed on every upload, which must not
-- traverse the task join to work out who owns a file.
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- The quota sum (per team) and the drawer's list (per task).
CREATE INDEX "attachments_team_id_idx" ON "attachments"("team_id");
CREATE INDEX "attachments_task_id_idx" ON "attachments"("task_id");
CREATE UNIQUE INDEX "attachments_storage_key_unique" ON "attachments"("storage_key");

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Uploader is RESTRICT (the Comment.author precedent): a file keeps its
-- attributed owner, and future account deletion must resolve that deliberately
-- rather than silently orphaning bytes.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
