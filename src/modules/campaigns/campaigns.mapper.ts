import type { Campaign, CampaignStatus } from "@prisma/client";
import { appConfig } from "../../config/app.config.js";
import { estimateReach, reachPerDollar } from "../../utils/reach.js";
import type { CampaignStats } from "./campaign-stats.js";
import type { AdAsset, Reach, Source, StoryBlock } from "./campaigns.schema.js";

function perDollar(c: Campaign) {
  return c.reachPerDollar ?? reachPerDollar(c.category);
}

function fundingSummary(c: Campaign, stats: CampaignStats) {
  const goal = c.fundingGoalCents ?? 0;
  return {
    raisedCents: stats.raisedCents,
    goalCents: c.fundingGoalCents,
    percentFunded: goal > 0 ? Math.floor((stats.raisedCents / goal) * 100) : 0,
    backerCount: stats.backerCount,
    deadline: c.fundingDeadline,
    // Reach is always an estimate, shown as a range
    estimatedReachAtGoal: goal > 0 ? estimateReach(goal, perDollar(c)) : null,
    reachPerDollar: Math.round(perDollar(c) * 10) / 10,
  };
}

/** First image ad asset that is roughly square: fits portrait/square card thumbnails without cropping the subject. */
export function squareImageUrl(c: Pick<Campaign, "adAssets">) {
  const assets = (c.adAssets as AdAsset[] | null) ?? [];
  const sq = assets.find((a) => a.type === "image" && a.width && a.height && Math.abs(a.width / a.height - 1) < 0.25);
  return sq?.url ?? null;
}

/** Feed / Explore card. */
export function toCampaignCard(c: Campaign, stats: CampaignStats) {
  return {
    id: c.id,
    slug: c.slug,
    status: c.status,
    title: c.title,
    category: c.category,
    creatorName: c.creatorName,
    creatorType: c.creatorType,
    summary: c.summary,
    coverImageUrl: c.coverImageUrl,
    squareImageUrl: squareImageUrl(c),
    isFeatured: c.isFeatured,
    isDemo: c.isDemo,
    publishedAt: c.publishedAt,
    funding: fundingSummary(c, stats),
  };
}

/** Public campaign page. */
export function toCampaignDetail(c: Campaign, stats: CampaignStats) {
  return {
    ...toCampaignCard(c, stats),
    creatorDescription: c.creatorDescription,
    targetAudience: c.targetAudience,
    whyItMatters: c.whyItMatters,
    story: {
      headline: c.storyHeadline,
      intro: c.storyIntro,
      blocks: c.storyBlocks as StoryBlock[],
    },
    sources: c.sources as Source[],
    ad: {
      headline: adHeadline(c),
      description: c.adDescription,
      ctaText: c.ctaText,
      assets: c.adAssets as AdAsset[],
    },
    reach: c.reach as Partial<Reach>,
    durationDays: c.durationDays,
    submittedAt: c.submittedAt,
    timeline: buildTimeline(c),
    useOfFunds: {
      platformFeePct: appConfig.fees.platformFeePct,
      adSharePct: 100 - appConfig.fees.platformFeePct,
      processingFeePct: appConfig.fees.processingFeePct,
      adBudgetCents: stats.adBudgetCents,
    },
  };
}

/** The creator's own view: everything, plus editing state. */
export function toOwnerCampaign(c: Campaign, stats: CampaignStats) {
  return {
    ...toCampaignDetail(c, stats),
    currentStep: c.currentStep,
    creationMode: c.creationMode,
    // Raw ad headline (the public view falls back to the title)
    adHeadline: c.adHeadline,
    fundingGoalCents: c.fundingGoalCents,
    rulesAccepted: c.rulesAcceptedAt !== null,
    isEditable: (appConfig.editableStatuses as readonly string[]).includes(c.status),
    // Editing a live campaign sends it back through review
    editRequiresReview: c.status === "approved" || c.status === "funding",
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** "The beginning of the title may be used as an advertising headline if a custom headline is not supplied." */
function adHeadline(c: Campaign) {
  return c.adHeadline || c.title?.slice(0, 40) || null;
}

const TIMELINE: { status: CampaignStatus; label: string; at: (c: Campaign) => Date | null }[] = [
  { status: "submitted", label: "Submitted for review", at: (c) => c.submittedAt },
  { status: "approved", label: "Approved", at: (c) => c.approvedAt },
  { status: "funding", label: "Live for funding", at: (c) => c.publishedAt },
  { status: "funded", label: "Funding closed", at: (c) => c.fundedAt ?? c.fundingEndedAt },
  { status: "distribution_prep", label: "Distribution preparation", at: (c) => c.distributionPrepAt },
  { status: "promoting", label: "Promoting", at: (c) => c.promotingAt },
  { status: "completed", label: "Completed", at: (c) => c.completedAt },
];

/** Past steps carry a date; upcoming steps have none. */
export function buildTimeline(c: Campaign) {
  if (c.status === "draft") return [];
  if (c.status === "changes_requested" || c.status === "rejected") {
    // Reviewed and stopped at the review step (until resubmitted, for requested changes)
    const reached = TIMELINE.filter((step) => step.at(c)).map((step) => ({ key: step.status, label: step.label, at: step.at(c), isCurrent: false }));
    const label = c.status === "rejected" ? "Not approved" : "Changes requested";
    return [...reached, { key: c.status, label, at: c.reviewedAt, isCurrent: true }];
  }
  if (c.status === "cancelled") {
    // Only the steps it actually went through, ending on the cancellation
    const reached = TIMELINE.filter((step) => step.at(c)).map((step) => ({
      key: step.status,
      label: step.label,
      at: step.at(c),
      isCurrent: false,
    }));
    return [...reached, { key: "cancelled" as const, label: "Cancelled", at: c.cancelledAt, isCurrent: true }];
  }
  return TIMELINE.map((step) => ({
    key: step.status,
    label:
      step.status === "funded" && c.fundedAt
        ? "Funding goal reached"
        : step.status === "funded" && c.fundingEndedAt
          ? "Funding period ended"
          : step.label,
    at: step.at(c),
    isCurrent:
      c.status === step.status ||
      (step.status === "funded" && (c.status === "funded" || c.status === "funding_ended")),
  }));
}
