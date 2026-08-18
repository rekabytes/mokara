-- DropForeignKey
ALTER TABLE "team_invitations" DROP CONSTRAINT "team_invitations_invitee_username_fkey";

-- DropForeignKey
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_user_id_fkey";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "team_invitations" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');

-- AlterTable
ALTER TABLE "teams" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invitee_username_fkey" FOREIGN KEY ("invitee_username") REFERENCES "users"("username") ON DELETE RESTRICT ON UPDATE CASCADE;
