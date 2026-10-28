-- AlterTable
ALTER TABLE "users" ADD COLUMN "app_introduced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assistant_enabled" BOOLEAN NOT NULL DEFAULT true;
