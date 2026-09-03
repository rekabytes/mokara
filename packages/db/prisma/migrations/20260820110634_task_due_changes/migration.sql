-- AlterTable
ALTER TABLE "team_invitations" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');

-- CreateTable
CREATE TABLE "task_due_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "from_due" TIMESTAMPTZ(3),
    "to_due" TIMESTAMPTZ(3),
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_due_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_due_changes_task_id_created_at_idx" ON "task_due_changes"("task_id", "created_at");

-- AddForeignKey
ALTER TABLE "task_due_changes" ADD CONSTRAINT "task_due_changes_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_due_changes" ADD CONSTRAINT "task_due_changes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
