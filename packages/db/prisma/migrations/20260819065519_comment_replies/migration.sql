-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "parent_id" UUID;

-- AlterTable
ALTER TABLE "team_invitations" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');

-- CreateIndex
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
