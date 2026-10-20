-- CreateEnum
CREATE TYPE "review_decision" AS ENUM ('approved', 'changes_requested', 'rejected');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "campaign_status" ADD VALUE 'changes_requested';
ALTER TYPE "campaign_status" ADD VALUE 'rejected';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'campaign_changes_requested';
ALTER TYPE "notification_type" ADD VALUE 'campaign_rejected';

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "rejected_at" TIMESTAMPTZ(3),
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notification_prefs" JSONB;

-- CreateTable
CREATE TABLE "campaign_reviews" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "decision" "review_decision" NOT NULL,
    "summary" TEXT NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "reviewer" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_reviews_campaign_id_created_at_idx" ON "campaign_reviews"("campaign_id", "created_at");

-- AddForeignKey
ALTER TABLE "campaign_reviews" ADD CONSTRAINT "campaign_reviews_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

