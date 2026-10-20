-- AlterTable
ALTER TABLE "contributions" ADD COLUMN     "guest_email" TEXT,
ADD COLUMN     "guest_token" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "contributions_guest_token_key" ON "contributions"("guest_token");

-- CreateIndex
CREATE INDEX "contributions_idempotency_key_idx" ON "contributions"("idempotency_key");

