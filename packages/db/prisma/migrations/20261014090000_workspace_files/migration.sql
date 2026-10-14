CREATE TABLE "workspace_folders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" UUID NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "parent_id" UUID,
  "name" TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  "created_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "creator_name" TEXT NOT NULL,
  "trashed_at" TIMESTAMPTZ(3),
  "trash_batch_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_folders_id_team_id_key" UNIQUE("id", "team_id"),
  CONSTRAINT "workspace_folders_parent_id_team_id_fkey" FOREIGN KEY("parent_id", "team_id") REFERENCES "workspace_folders"("id", "team_id") ON DELETE CASCADE,
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK ((trashed_at IS NULL) = (trash_batch_id IS NULL))
);
CREATE INDEX "workspace_folders_team_id_parent_id_trashed_at_idx" ON "workspace_folders"("team_id", "parent_id", "trashed_at");
CREATE TABLE "workspace_files" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" UUID NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "folder_id" UUID,
  "name" TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  "uploaded_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "uploader_name" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL CHECK (size_bytes > 0),
  "content_type" TEXT NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/gif','image/webp','application/pdf')),
  "content_hash" TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  "upload_id" UUID NOT NULL UNIQUE,
  "storage_key" TEXT NOT NULL UNIQUE,
  "trashed_at" TIMESTAMPTZ(3),
  "trash_batch_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_files_folder_id_team_id_fkey" FOREIGN KEY("folder_id", "team_id") REFERENCES "workspace_folders"("id", "team_id") ON DELETE CASCADE,
  CHECK ((trashed_at IS NULL) = (trash_batch_id IS NULL))
);
CREATE INDEX "workspace_files_team_id_folder_id_trashed_at_idx" ON "workspace_files"("team_id", "folder_id", "trashed_at");
CREATE INDEX "workspace_files_trashed_at_idx" ON "workspace_files"("trashed_at");
CREATE TABLE "file_object_deletions" (
  "upload_id" UUID UNIQUE,
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "storage_key" TEXT NOT NULL UNIQUE,
  "size_bytes" INTEGER NOT NULL CHECK (size_bytes > 0),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "file_object_deletions_next_attempt_at_idx" ON "file_object_deletions"("next_attempt_at");
CREATE INDEX "file_object_deletions_owner_id_idx" ON "file_object_deletions"("owner_id");

CREATE INDEX "workspace_folders_trashed_at_idx" ON "workspace_folders"("trashed_at");
CREATE INDEX "file_object_deletions_team_id_idx" ON "file_object_deletions"("team_id");
