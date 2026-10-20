-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('draft', 'submitted', 'approved', 'funding', 'funded', 'funding_ended', 'distribution_prep', 'promoting', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "category" AS ENUM ('environment', 'health', 'science', 'education', 'public_policy', 'economic_policy', 'community', 'arts_culture', 'business', 'other');

-- CreateEnum
CREATE TYPE "creator_type" AS ENUM ('individual', 'influencer', 'nonprofit', 'organization', 'business', 'community_group');

-- CreateEnum
CREATE TYPE "creation_mode" AS ENUM ('manual', 'voice');

-- CreateEnum
CREATE TYPE "contribution_status" AS ENUM ('pending', 'succeeded', 'failed', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('submission_received', 'campaign_approved', 'campaign_live', 'funding_milestone', 'deadline_approaching', 'funding_ended', 'contribution_succeeded', 'contribution_failed', 'promotion_started', 'distribution_progress', 'campaign_completed', 'report_available', 'campaign_update', 'new_comment', 'security_alert');

-- CreateEnum
CREATE TYPE "feedback_answer" AS ENUM ('no', 'somewhat', 'yes');

-- CreateEnum
CREATE TYPE "report_reason" AS ENUM ('spam', 'abusive', 'misleading', 'other');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "slug" TEXT,
    "status" "campaign_status" NOT NULL DEFAULT 'draft',
    "status_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_step" SMALLINT NOT NULL DEFAULT 1,
    "creation_mode" "creation_mode" NOT NULL DEFAULT 'manual',
    "title" VARCHAR(60),
    "category" "category",
    "creator_name" TEXT,
    "creator_type" "creator_type",
    "creator_description" TEXT,
    "summary" TEXT,
    "cover_image_url" TEXT,
    "target_audience" TEXT,
    "why_it_matters" TEXT,
    "story_headline" TEXT,
    "story_intro" TEXT,
    "story_blocks" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "ad_headline" TEXT,
    "ad_description" TEXT,
    "cta_text" TEXT,
    "ad_assets" JSONB NOT NULL DEFAULT '[]',
    "reach" JSONB NOT NULL DEFAULT '{}',
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "funding_goal_cents" INTEGER,
    "rules_accepted_at" TIMESTAMPTZ(3),
    "reach_per_dollar" DOUBLE PRECISION,
    "funding_deadline" TIMESTAMPTZ(3),
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "funded_at" TIMESTAMPTZ(3),
    "funding_ended_at" TIMESTAMPTZ(3),
    "distribution_prep_at" TIMESTAMPTZ(3),
    "promoting_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    "processing_fee_cents" INTEGER NOT NULL,
    "status" "contribution_status" NOT NULL DEFAULT 'pending',
    "failure_reason" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "payment_ref" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "user_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("user_id","campaign_id")
);

-- CreateTable
CREATE TABLE "campaign_updates" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "campaign_id" UUID,
    "type" "notification_type" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_metrics" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "ad_spend_cents" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "reach" INTEGER NOT NULL,

    CONSTRAINT "distribution_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_responses" (
    "campaign_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "visuals_answer" "feedback_answer",
    "changed_mind_answer" "feedback_answer",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "feedback_responses_pkey" PRIMARY KEY ("campaign_id","user_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" VARCHAR(1000) NOT NULL,
    "hidden_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_reports" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" "report_reason" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("comment_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_creator_id_idx" ON "campaigns"("creator_id");

-- CreateIndex
CREATE INDEX "campaigns_status_status_changed_at_idx" ON "campaigns"("status", "status_changed_at");

-- CreateIndex
CREATE INDEX "contributions_campaign_id_status_idx" ON "contributions"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "contributions_user_id_created_at_idx" ON "contributions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_user_id_idempotency_key_key" ON "contributions"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "follows_campaign_id_idx" ON "follows"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_updates_campaign_id_created_at_idx" ON "campaign_updates"("campaign_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "distribution_metrics_campaign_id_recorded_at_idx" ON "distribution_metrics"("campaign_id", "recorded_at");

-- CreateIndex
CREATE INDEX "comments_campaign_id_created_at_idx" ON "comments"("campaign_id", "created_at");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_updates" ADD CONSTRAINT "campaign_updates_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_metrics" ADD CONSTRAINT "distribution_metrics_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
