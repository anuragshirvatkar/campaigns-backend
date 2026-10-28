-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'admin');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" "user_role" NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "ai_review" JSONB;
