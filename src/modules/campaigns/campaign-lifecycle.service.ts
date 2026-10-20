// Status changes that happen on their own: run by the scheduler (src/jobs) and by payments.
// Every transition is a conditional update ("only if still in status X"), so running a job
// twice, or a job racing a payment, can never move a campaign twice.
import type { Campaign, CampaignStatus, Prisma } from "@prisma/client";
import { appConfig } from "../../config/app.config.js";
import { prisma } from "../../lib/prisma.js";
import { formatUsd } from "../../utils/money.js";
import { campaignAudience, notifyUsers } from "../notifications/notifications.service.js";
import { getStatsFor } from "./campaign-stats.js";
import { reviewCampaign } from "./campaign-review.service.js";

type Db = Prisma.TransactionClient | typeof prisma;

const { lifecycle, funding } = appConfig;
const BATCH = 50;

function secondsAgo(now: Date, seconds: number) {
  return new Date(now.getTime() - seconds * 1000);
}

async function transition(
  id: string,
  from: CampaignStatus | CampaignStatus[],
  data: Prisma.CampaignUpdateManyMutationInput,
  db: Db = prisma,
) {
  const { count } = await db.campaign.updateMany({
    where: { id, status: Array.isArray(from) ? { in: from } : from },
    data: { ...data, statusChangedAt: new Date() },
  });
  return count === 1;
}

const name = (c: Pick<Campaign, "title">) => c.title ?? "Your campaign";

// ─── Submitted → reviewed: approved & live, changes requested, or rejected ────

// Campaigns being reviewed right now, so a slow review isn't started twice by overlapping ticks
const reviewing = new Set<string>();

export async function approveDueCampaigns(now = new Date()) {
  const due = await prisma.campaign.findMany({
    where: { status: "submitted", statusChangedAt: { lte: secondsAgo(now, lifecycle.approvalDelaySec) } },
    take: BATCH,
  });

  for (const c of due) {
    if (reviewing.has(c.id)) continue;
    reviewing.add(c.id);
    try {
      await reviewOne(c, now);
    } finally {
      reviewing.delete(c.id);
    }
  }
}

async function reviewOne(c: Campaign, now: Date) {
  const result = await reviewCampaign(c);
  // A campaign that was already live (re-reviewed after an edit) is never rejected outright: its
  // backers' money is committed, so the creator is asked to fix it instead
  if (result.decision === "rejected" && c.publishedAt) result.decision = "changes_requested";
  const reviewedAt = new Date();

  if (result.decision !== "approved") {
    const rejected = result.decision === "rejected";
    // Only if nothing changed meanwhile: a creator edit restarts the review clock
    const { count } = await prisma.campaign.updateMany({
      where: { id: c.id, status: "submitted", statusChangedAt: c.statusChangedAt },
      data: {
        status: result.decision,
        reviewedAt,
        statusChangedAt: reviewedAt,
        ...(rejected ? { rejectedAt: reviewedAt } : {}),
      },
    });
    if (count === 0) return;
    await prisma.campaignReview.create({
      data: { campaignId: c.id, decision: result.decision, summary: result.summary, issues: result.issues, reviewer: result.reviewer },
    });
    await notifyUsers([c.creatorId], {
      type: rejected ? "campaign_rejected" : "campaign_changes_requested",
      campaignId: c.id,
      title: rejected ? `${name(c)} wasn't approved` : `Changes requested for ${name(c)}`,
      body: rejected
        ? `${result.summary} ${result.issues[0]?.message ?? ""}`.trim()
        : `${result.summary} Open the campaign to see what to fix, then resubmit.`,
      eventKey: `review:${c.id}:${c.submittedAt?.getTime() ?? 0}`,
    });
    return;
  }

  const { raisedCents } = await getStatsFor(c.id);
  const goalReached = c.fundingGoalCents !== null && raisedCents >= c.fundingGoalCents;
  const firstPublish = c.publishedAt === null;

  const moved = await transition(c.id, "submitted", {
    status: goalReached ? "funded" : "funding",
    reviewedAt,
    approvedAt: now,
    publishedAt: c.publishedAt ?? now,
    fundingDeadline: c.fundingDeadline ?? new Date(now.getTime() + c.durationDays * 86_400_000),
    ...(goalReached && !c.fundedAt ? { fundedAt: now } : {}),
  });
  if (!moved) return;
  await prisma.campaignReview.create({
    data: { campaignId: c.id, decision: "approved", summary: result.summary, issues: [], reviewer: result.reviewer },
  });

  await notifyUsers([c.creatorId], {
    type: "campaign_approved",
    campaignId: c.id,
    title: firstPublish ? `${name(c)} is approved and live` : `Your changes to ${name(c)} are approved`,
    body: firstPublish
      ? "Your campaign is now open for backing. Share it to get your first backers."
      : "The updated campaign is live again.",
    eventKey: `approved:${c.id}:${c.submittedAt?.getTime() ?? 0}`,
  });

  if (firstPublish) {
    const followers = await campaignAudience(c.id, { includeOwner: false });
    await notifyUsers(followers, {
      type: "campaign_live",
      campaignId: c.id,
      title: `${name(c)} is open for backing`,
      body: "Contributions now fund ads that carry this message to new audiences.",
      eventKey: `live:${c.id}`,
    });
  }
}

// ─── Funding deadline passed → funding ended ──────────────────────────────────

export async function endExpiredFunding(now = new Date()) {
  const expired = await prisma.campaign.findMany({
    where: { status: "funding", fundingDeadline: { lte: now } },
    take: BATCH,
  });

  for (const c of expired) {
    if (!(await transition(c.id, "funding", { status: "funding_ended", fundingEndedAt: now }))) continue;

    const { raisedCents } = await getStatsFor(c.id);
    await notifyUsers(await campaignAudience(c.id), {
      type: "funding_ended",
      campaignId: c.id,
      title: `Funding has closed for ${name(c)}`,
      body:
        raisedCents > 0
          ? `${formatUsd(raisedCents)} was raised. Everything raised goes into promoting the message; ads are being prepared next.`
          : "The campaign closed without contributions, so no ads will run.",
      eventKey: `funding-ended:${c.id}`,
    });
  }
}

// ─── Funded (or ended with money) → distribution preparation ─────────────────

export async function startDistributionPrep(now = new Date()) {
  const ready = await prisma.campaign.findMany({
    where: {
      status: { in: ["funded", "funding_ended"] },
      statusChangedAt: { lte: secondsAgo(now, lifecycle.distributionPrepDelaySec) },
    },
    take: BATCH,
  });

  for (const c of ready) {
    // A campaign that raised nothing has nothing to distribute
    if (c.status === "funding_ended" && (await getStatsFor(c.id)).raisedCents === 0) continue;
    await transition(c.id, c.status, { status: "distribution_prep", distributionPrepAt: now });
  }
}

// ─── Distribution preparation → promoting ─────────────────────────────────────

export async function startPromotion(now = new Date()) {
  const ready = await prisma.campaign.findMany({
    where: {
      status: "distribution_prep",
      statusChangedAt: { lte: secondsAgo(now, lifecycle.distributionPrepDelaySec) },
    },
    take: BATCH,
  });

  for (const c of ready) {
    if (!(await transition(c.id, "distribution_prep", { status: "promoting", promotingAt: now }))) continue;

    await notifyUsers(await campaignAudience(c.id), {
      type: "promotion_started",
      campaignId: c.id,
      title: `Ads for ${name(c)} are now running`,
      body: "The message is being shown to new audiences. Follow the reach as it grows.",
      eventKey: `promotion-started:${c.id}`,
    });
  }
}

// ─── Promoting → completed (called when the ad budget is fully spent) ─────────

export async function completePromotion(c: Campaign, now = new Date()) {
  if (!(await transition(c.id, "promoting", { status: "completed", completedAt: now }))) return;

  const audience = await campaignAudience(c.id);
  await notifyUsers(audience, {
    type: "campaign_completed",
    campaignId: c.id,
    title: `${name(c)} has finished its promotion`,
    body: "The full ad budget has been spent spreading the message.",
    eventKey: `completed:${c.id}`,
  });
  await notifyUsers(audience, {
    type: "report_available",
    campaignId: c.id,
    title: `The final report for ${name(c)} is ready`,
    body: "See funds raised, ad spend, impressions, clicks and people reached.",
    eventKey: `report:${c.id}`,
  });
}

// ─── Deadline reminders (once per person per campaign, via the dedupe key) ────

export async function remindDeadlines(now = new Date()) {
  const soon = await prisma.campaign.findMany({
    where: {
      status: "funding",
      fundingDeadline: { gt: now, lte: new Date(now.getTime() + funding.deadlineReminderHours * 3_600_000) },
    },
    take: BATCH,
  });

  for (const c of soon) {
    const [audience, backers, stats] = await Promise.all([
      campaignAudience(c.id),
      prisma.contribution.findMany({
        where: { campaignId: c.id, status: "succeeded" },
        select: { userId: true },
        distinct: ["userId"],
      }),
      getStatsFor(c.id),
    ]);
    const backed = new Set(backers.map((b) => b.userId));
    // The owner always hears about it; followers only if they haven't backed yet
    const recipients = audience.filter((id) => id === c.creatorId || !backed.has(id));

    const hoursLeft = Math.max(1, Math.round((c.fundingDeadline!.getTime() - now.getTime()) / 3_600_000));
    const timeLeft = hoursLeft >= 48 ? `${Math.round(hoursLeft / 24)} days` : `${hoursLeft} hours`;
    const pct = c.fundingGoalCents ? Math.floor((stats.raisedCents / c.fundingGoalCents) * 100) : 0;

    await notifyUsers(recipients, {
      type: "deadline_approaching",
      campaignId: c.id,
      title: `${timeLeft} left for ${name(c)}`,
      body: `${pct}% funded so far. Contributions close when the deadline passes.`,
      eventKey: `deadline:${c.id}`,
    });
  }
}

// ─── Called by payments ───────────────────────────────────────────────────────

/** Moves a funding campaign to funded once succeeded contributions reach the goal. */
export async function markFundedIfGoalReached(campaignId: string, db: Db = prisma) {
  const c = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.status !== "funding" || !c.fundingGoalCents) return false;
  const { raisedCents } = await getStatsFor(campaignId, db);
  if (raisedCents < c.fundingGoalCents) return false;
  return transition(campaignId, "funding", { status: "funded", fundedAt: new Date() }, db);
}

/** Notifies owner + followers for every 25/50/75/100% threshold a contribution crossed. */
export async function notifyMilestones(c: Campaign, beforeCents: number, afterCents: number) {
  if (!c.fundingGoalCents) return;
  const before = (beforeCents / c.fundingGoalCents) * 100;
  const after = (afterCents / c.fundingGoalCents) * 100;
  const crossed = funding.milestonesPct.filter((pct) => before < pct && after >= pct);
  if (crossed.length === 0) return;

  const audience = await campaignAudience(c.id);
  for (const pct of crossed) {
    await notifyUsers(audience, {
      type: "funding_milestone",
      campaignId: c.id,
      title: pct === 100 ? `${name(c)} is fully funded` : `${name(c)} is ${pct}% funded`,
      body:
        pct === 100
          ? `The ${formatUsd(c.fundingGoalCents)} goal is reached. Ads will be prepared next.`
          : `${formatUsd(afterCents)} of ${formatUsd(c.fundingGoalCents)} raised to promote this message.`,
      eventKey: `milestone:${pct}:${c.id}`,
    });
  }
}
