// Creator side of campaigns: drafts, autosave, submit, edit, cancel.
import { Prisma, type Campaign, type CampaignStatus } from "@prisma/client";
import type { z } from "zod";
import { appConfig } from "../../config/app.config.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { reachPerDollar } from "../../utils/reach.js";
import { makeSlug } from "../../utils/slug.js";
import { notifyUsers } from "../notifications/notifications.service.js";
import { getStats, getStatsFor, statsOf } from "./campaign-stats.js";
import { toCampaignCard, toOwnerCampaign } from "./campaigns.mapper.js";
import type {
  AdAsset,
  myCampaignsQuery,
  Reach,
  Source,
  StoryBlock,
  UpdateCampaignBody,
} from "./campaigns.schema.js";

type Tab = NonNullable<z.infer<typeof myCampaignsQuery>["tab"]>;

const TAB_STATUSES: Record<Exclude<Tab, "requires_action">, CampaignStatus[]> = {
  drafts: ["draft"],
  under_review: ["submitted", "changes_requested", "approved"],
  funding: ["funding"],
  promoting: ["funded", "funding_ended", "distribution_prep", "promoting"],
  completed: ["completed", "cancelled", "rejected"],
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function createDraft(userId: string, creationMode: "manual" | "voice") {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const campaign = await prisma.campaign.create({
    data: { creatorId: userId, creationMode, creatorName: user.fullName },
  });
  return ownerView(campaign);
}

export async function listMyCampaigns(userId: string, tab?: Tab) {
  const campaigns = await prisma.campaign.findMany({
    where: { creatorId: userId },
    orderBy: { updatedAt: "desc" },
  });
  const stats = await getStats(campaigns.map((c) => c.id));
  const cards = campaigns.map((c) => ({
    ...toCampaignCard(c, statsOf(stats, c.id)),
    currentStep: c.currentStep,
    updatedAt: c.updatedAt,
    requiresAction: requiresAction(c, statsOf(stats, c.id).raisedCents),
  }));

  const counts = {
    drafts: 0,
    under_review: 0,
    funding: 0,
    promoting: 0,
    completed: 0,
    requires_action: cards.filter((c) => c.requiresAction).length,
  };
  for (const card of cards) {
    for (const [key, statuses] of Object.entries(TAB_STATUSES)) {
      if (statuses.includes(card.status)) counts[key as keyof typeof counts]++;
    }
  }

  const items = !tab
    ? cards
    : tab === "requires_action"
      ? cards.filter((c) => c.requiresAction)
      : cards.filter((c) => TAB_STATUSES[tab].includes(c.status));

  return { items, counts };
}

/**
 * Something the creator should do now: finish an unsubmitted draft,
 * or share a live campaign that closes within the reminder window while under goal.
 */
function requiresAction(c: Campaign, raisedCents: number) {
  if (c.status === "draft" || c.status === "changes_requested") return true;
  if (c.status !== "funding" || !c.fundingDeadline || !c.fundingGoalCents) return false;
  const closesSoon =
    c.fundingDeadline.getTime() - Date.now() < appConfig.funding.deadlineReminderHours * 3_600_000;
  return closesSoon && raisedCents < c.fundingGoalCents;
}

export async function getMyCampaign(userId: string, id: string) {
  return ownerView(await loadOwn(userId, id));
}

async function loadOwn(userId: string, id: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  // 404 rather than 403, so other people's campaign ids are not confirmed
  if (!campaign || campaign.creatorId !== userId) throw AppError.notFound("Campaign not found.");
  return campaign;
}

async function ownerView(campaign: Campaign) {
  const [stats, review] = await Promise.all([
    getStatsFor(campaign.id),
    prisma.campaignReview.findFirst({ where: { campaignId: campaign.id }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    ...toOwnerCampaign(campaign, stats),
    readiness: checkReadiness(campaign),
    // The latest moderation decision, shown to the creator with what to fix
    review: review && {
      decision: review.decision,
      summary: review.summary,
      issues: review.issues as Issue[],
      reviewer: review.reviewer,
      at: review.createdAt,
    },
  };
}

// ─── Autosave / edit ──────────────────────────────────────────────────────────

const NON_CONTENT_FIELDS = new Set(["currentStep", "creationMode"]);

export async function updateMyCampaign(userId: string, id: string, body: UpdateCampaignBody) {
  const campaign = await loadOwn(userId, id);
  if (!(appConfig.editableStatuses as readonly string[]).includes(campaign.status)) {
    throw AppError.conflict(
      "This campaign can no longer be edited because its ads are being prepared or have already run.",
    );
  }

  const { rulesAccepted, reach, ...fields } = body;
  const data: Prisma.CampaignUpdateInput = { ...fields };
  if (rulesAccepted !== undefined) data.rulesAcceptedAt = rulesAccepted ? new Date() : null;
  if (reach) data.reach = normalizeReach(reach);

  const contentChanged = Object.keys(body).some((key) => !NON_CONTENT_FIELDS.has(key));
  const live = campaign.status === "approved" || campaign.status === "funding";

  if (contentChanged && live) {
    // Material changes go back through review before the campaign is shown again
    const issues = checkReadiness({ ...campaign, ...(data as Partial<Campaign>) }).issues;
    if (issues.length > 0) {
      throw new AppError(422, "CAMPAIGN_INCOMPLETE", "Some required details are missing.", issues);
    }
    Object.assign(data, {
      status: "submitted",
      submittedAt: new Date(),
      statusChangedAt: new Date(),
      reachPerDollar: reachPerDollar(body.category ?? campaign.category),
      aiReview: Prisma.DbNull,
    });
  } else if (contentChanged && campaign.status === "submitted") {
    // The admin must see the latest version: restart the clock and redo the pre-screen
    data.statusChangedAt = new Date();
    data.aiReview = Prisma.DbNull;
  }

  const updated = await prisma.campaign.update({ where: { id }, data });

  if (contentChanged && live) {
    await notifyUsers([userId], {
      type: "submission_received",
      campaignId: id,
      title: `Your changes to ${updated.title} are under review`,
      body: "The campaign will be live again once the admin approves the changes.",
      eventKey: `resubmitted:${id}:${updated.submittedAt?.getTime()}`,
    });
    await notifyAdmins(updated);
  }
  return ownerView(updated);
}

/** One selected channel gets the whole budget; unselected channels are dropped from the split. */
function normalizeReach(reach: Reach): Reach {
  const budgetSplit: Reach["budgetSplit"] = {};
  for (const ch of reach.channels) budgetSplit[ch] = reach.budgetSplit[ch] ?? 0;
  if (reach.channels.length === 1) budgetSplit[reach.channels[0]!] = 100;
  return { ...reach, budgetSplit };
}

// ─── Submit ───────────────────────────────────────────────────────────────────

export async function submitMyCampaign(userId: string, id: string) {
  const campaign = await loadOwn(userId, id);
  // A draft, or a campaign sent back with requested changes, can be (re)submitted
  if (campaign.status !== "draft" && campaign.status !== "changes_requested") {
    throw AppError.conflict("This campaign has already been submitted.");
  }
  const { issues } = checkReadiness(campaign);
  if (issues.length > 0) {
    throw new AppError(422, "CAMPAIGN_INCOMPLETE", "Some required details are missing.", issues);
  }

  const now = new Date();
  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      status: "submitted",
      submittedAt: now,
      statusChangedAt: now,
      currentStep: 5,
      slug: campaign.slug ?? makeSlug(campaign.title!),
      // Freeze the estimate model this campaign was submitted with
      reachPerDollar: reachPerDollar(campaign.category),
      aiReview: Prisma.DbNull,
    },
  });

  await notifyUsers([userId], {
    type: "submission_received",
    campaignId: id,
    title: `We received ${updated.title}`,
    body: "The Campaigns team reviews every campaign before it goes live. You'll be notified of the decision.",
    eventKey: `submitted:${id}:${now.getTime()}`,
  });
  await notifyAdmins(updated);
  return ownerView(updated);
}

/** Tells the admin a campaign joined the review queue. */
async function notifyAdmins(c: Campaign) {
  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true } });
  await notifyUsers(
    admins.map((a) => a.id),
    {
      type: "submission_received",
      campaignId: c.id,
      title: "New campaign to review",
      body: `${c.title} by ${c.creatorName ?? "a creator"} is waiting for your review.`,
      eventKey: `admin-review:${c.id}:${c.submittedAt?.getTime() ?? 0}`,
    },
  );
}

type Issue = { field: string; step: number; message: string };

/**
 * What blocks submission (issues) and what is only worth a warning (warnings).
 * Steps match the creation flow so the app can jump straight to the right screen.
 */
export function checkReadiness(c: Campaign) {
  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  const need = (ok: unknown, field: string, step: number, message: string) => {
    if (!ok) issues.push({ field, step, message });
  };

  // Step 1 — Basics
  need(c.title?.trim(), "title", 1, "Add a campaign title.");
  need(c.category, "category", 1, "Choose a category.");
  need(c.creatorName?.trim(), "creatorName", 1, "Add the creator or organization name.");
  need(c.summary?.trim(), "summary", 1, "Add a short summary.");
  need(c.coverImageUrl, "coverImageUrl", 1, "Add a cover image.");

  // Step 2 — Story
  const blocks = (c.storyBlocks ?? []) as StoryBlock[];
  const sources = (c.sources ?? []) as Source[];
  need(
    blocks.some((b) => b.type === "paragraph" && b.text.trim()),
    "storyBlocks",
    2,
    "Write at least one paragraph of your story.",
  );
  const sourceIds = new Set(sources.map((s) => s.id));
  for (const b of blocks) {
    if (b.type === "stat" && b.sourceId && !sourceIds.has(b.sourceId)) {
      issues.push({ field: "storyBlocks", step: 2, message: `The statistic "${b.value}" points to a source that no longer exists.` });
    }
  }
  if (sources.length === 0) warnings.push({ field: "sources", step: 2, message: "Add at least one source so readers can check your claims." });

  // Step 3 — Visuals
  const assets = (c.adAssets ?? []) as AdAsset[];
  need(
    assets.some((a) => a.type === "image"),
    "adAssets",
    3,
    "Add at least one square ad image.",
  );
  if (!c.adHeadline) warnings.push({ field: "adHeadline", step: 3, message: "No ad headline: the start of your title will be used." });

  // Step 4 — Reach
  const reach = (c.reach ?? {}) as Partial<Reach>;
  need(reach.locations?.length, "reach.locations", 4, "Add at least one target location.");
  need(reach.channels?.length, "reach.channels", 4, "Choose at least one distribution channel.");
  if (reach.channels?.length) {
    const total = reach.channels.reduce((sum, ch) => sum + (reach.budgetSplit?.[ch] ?? 0), 0);
    need(total === 100, "reach.budgetSplit", 4, "The budget split across channels must add up to 100%.");
  }

  // Step 5 — Submit
  need(c.fundingGoalCents, "fundingGoalCents", 5, "Set a funding goal.");
  need(c.rulesAcceptedAt, "rulesAccepted", 5, "Confirm the campaign rules and submission policies.");

  return { issues, warnings, canSubmit: issues.length === 0 };
}

// ─── Delete / cancel ──────────────────────────────────────────────────────────

export async function deleteMyDraft(userId: string, id: string) {
  const campaign = await loadOwn(userId, id);
  // Rejected campaigns can't run again, so the creator may clear them away like a draft
  if (campaign.status !== "draft" && campaign.status !== "rejected") {
    throw AppError.conflict("Only drafts can be deleted. Submitted campaigns can be cancelled instead.");
  }
  await prisma.campaign.delete({ where: { id } });
}

export async function cancelMyCampaign(userId: string, id: string) {
  const campaign = await loadOwn(userId, id);
  if (!["submitted", "changes_requested", "approved", "funding"].includes(campaign.status)) {
    throw AppError.conflict("This campaign can't be cancelled at its current stage.");
  }
  // Contributions are spent on reach and never refunded, so cancelling is only possible before any arrive
  const paid = await prisma.contribution.count({ where: { campaignId: id, status: "succeeded" } });
  if (paid > 0) {
    throw AppError.conflict("This campaign already has backers, so it can't be cancelled.");
  }
  const { count } = await prisma.campaign.updateMany({
    where: { id, status: campaign.status },
    data: { status: "cancelled", cancelledAt: new Date(), statusChangedAt: new Date() },
  });
  if (count === 0) throw AppError.conflict("The campaign changed status. Please refresh and try again.");
  return getMyCampaign(userId, id);
}
