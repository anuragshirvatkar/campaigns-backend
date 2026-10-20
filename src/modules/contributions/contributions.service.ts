import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Campaign, Contribution } from "@prisma/client";
import type { z } from "zod";
import { charge } from "../../lib/dummy-payment.js";
import { sendEmail } from "../../lib/email.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { adShareCents, formatUsd, platformFeeCents, processingFeeCents } from "../../utils/money.js";
import { page } from "../../utils/pagination.js";
import { estimateReach, reachPerDollar } from "../../utils/reach.js";
import { markFundedIfGoalReached, notifyMilestones } from "../campaigns/campaign-lifecycle.service.js";
import { getStats, getStatsFor, statsOf } from "../campaigns/campaign-stats.js";
import { toCampaignCard } from "../campaigns/campaigns.mapper.js";
import { notifyUsers } from "../notifications/notifications.service.js";
import type { createContributionBody } from "./contributions.schema.js";

/** Who is paying: a signed-in user, or a guest identified by the receipt key their device holds. */
export type Payer = { userId?: string; guestToken?: string };

type CampaignRef = Pick<Campaign, "id" | "slug" | "title" | "coverImageUrl" | "category" | "reachPerDollar">;

function toContributionView(c: Contribution, campaign: CampaignRef) {
  const perDollar = campaign.reachPerDollar ?? reachPerDollar(campaign.category);
  return {
    id: c.id,
    receiptNumber: `RCPT-${c.id.slice(0, 8).toUpperCase()}`,
    status: c.status,
    failureReason: c.failureReason,
    campaign: {
      id: campaign.id,
      slug: campaign.slug,
      title: campaign.title,
      coverImageUrl: campaign.coverImageUrl,
    },
    breakdown: {
      contributionCents: c.amountCents,
      platformFeeCents: c.feeCents,
      adSpendCents: c.amountCents - c.feeCents,
      processingFeeCents: c.processingFeeCents,
      totalChargedCents: c.amountCents + c.processingFeeCents,
    },
    estimatedReach: estimateReach(c.amountCents, perDollar),
    isPublic: c.isPublic,
    isGuest: c.userId === null,
    paymentRef: c.paymentRef,
    paidAt: c.paidAt,
    createdAt: c.createdAt,
    isSimulated: true,
  };
}

const campaignRefSelect = {
  id: true,
  slug: true,
  title: true,
  coverImageUrl: true,
  category: true,
  reachPerDollar: true,
} as const;

// ─── Checkout ─────────────────────────────────────────────────────────────────

export async function createContribution(payer: Payer, body: z.infer<typeof createContributionBody>) {
  const userId = payer.userId ?? null;
  // A retried checkout returns the same pending payment instead of creating a second one
  const existing = await prisma.contribution.findFirst({
    where: { userId, idempotencyKey: body.idempotencyKey },
    include: { campaign: { select: campaignRefSelect } },
  });
  if (existing && (userId || sameToken(existing.guestToken, payer.guestToken))) {
    return { ...toContributionView(existing, existing.campaign), guestToken: existing.guestToken };
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: body.campaignId } });
  if (!campaign) throw AppError.notFound("Campaign not found.");
  assertAcceptingContributions(campaign);

  const contribution = await prisma.contribution.create({
    data: {
      campaignId: campaign.id,
      userId,
      // Guests only leave an email if they want a receipt; their name is never shown publicly
      guestEmail: userId ? null : (body.guestEmail ?? null),
      guestToken: userId ? null : randomBytes(24).toString("base64url"),
      amountCents: body.amountCents,
      // Fees are always calculated here, never trusted from the app
      feeCents: platformFeeCents(body.amountCents),
      processingFeeCents: processingFeeCents(body.amountCents),
      isPublic: userId ? body.isPublic : false,
      idempotencyKey: body.idempotencyKey,
    },
  });
  // The guest's device keeps this key to confirm the payment and open the receipt later
  return { ...toContributionView(contribution, campaign), guestToken: contribution.guestToken };
}

function sameToken(stored: string | null, given: string | undefined) {
  if (!stored || !given || stored.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(given));
}

function assertAcceptingContributions(campaign: Campaign) {
  if (campaign.status === "funding") return;
  const reason =
    campaign.status === "funded"
      ? "This campaign has reached its goal and is no longer accepting contributions."
      : campaign.status === "submitted"
        ? "This campaign is being reviewed after an update. Please try again in a minute."
        : "This campaign is not accepting contributions.";
  throw new AppError(409, "NOT_ACCEPTING_CONTRIBUTIONS", reason);
}

export async function confirmContribution(payer: Payer, id: string, cardNumber: string) {
  const contribution = await loadOwn(payer, id);
  // Already settled: return the same result instead of charging again
  if (contribution.status !== "pending") return getContribution(payer, id);
  // Guests have no account to notify or follow with
  const userId = contribution.userId;

  const result = charge(cardNumber);

  if (result.status !== "succeeded") {
    await prisma.contribution.updateMany({
      where: { id, status: "pending" },
      data: { status: result.status, failureReason: result.reason },
    });
    if (userId) {
      await notifyUsers([userId], {
        type: "contribution_failed",
        campaignId: contribution.campaignId,
        title: "Your payment didn't go through",
        body: result.reason,
        eventKey: `contribution-failed:${id}`,
      });
    }
    return getContribution(payer, id);
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: contribution.campaignId } });
    if (campaign.status !== "funding") {
      await tx.contribution.update({
        where: { id },
        data: {
          status: "failed",
          failureReason: "The campaign stopped accepting contributions before your payment completed. You were not charged.",
        },
      });
      return null;
    }

    const before = (await getStatsFor(campaign.id, tx)).raisedCents;
    const { count } = await tx.contribution.updateMany({
      where: { id, status: "pending" },
      data: { status: "succeeded", paymentRef: result.paymentRef, paidAt: new Date() },
    });
    if (count === 0) return null; // settled by a parallel request

    // Backing a campaign follows it, so the backer gets its updates
    if (userId) {
      await tx.follow.upsert({
        where: { userId_campaignId: { userId, campaignId: campaign.id } },
        create: { userId, campaignId: campaign.id },
        update: {},
      });
    }
    await markFundedIfGoalReached(campaign.id, tx);
    return { campaign, before, after: before + contribution.amountCents };
  });

  if (!outcome) {
    const settled = await prisma.contribution.findUniqueOrThrow({ where: { id } });
    if (settled.status === "failed" && userId) {
      await notifyUsers([userId], {
        type: "contribution_failed",
        campaignId: contribution.campaignId,
        title: "Your payment didn't go through",
        body: settled.failureReason ?? "You were not charged.",
        eventKey: `contribution-failed:${id}`,
      });
    }
  } else {
    const thanks = `Your ${formatUsd(contribution.amountCents)} contribution went through. ${formatUsd(adShareCents(contribution.amountCents))} goes straight into promoting the message.`;
    if (userId) {
      await notifyUsers([userId], {
        type: "contribution_succeeded",
        campaignId: contribution.campaignId,
        title: `Thank you for backing ${outcome.campaign.title}`,
        body: thanks,
        eventKey: `contribution-succeeded:${id}`,
      });
    } else if (contribution.guestEmail) {
      await sendGuestReceipt(contribution, outcome.campaign.title ?? "this campaign", thanks);
    }
    await notifyMilestones(outcome.campaign, outcome.before, outcome.after);
  }
  return getContribution(payer, id);
}

/** A guest has no account or Activity feed, so the receipt goes to the email they gave (if any). */
async function sendGuestReceipt(c: Contribution, title: string, thanks: string) {
  const receipt = `RCPT-${c.id.slice(0, 8).toUpperCase()}`;
  const total = formatUsd(c.amountCents + c.processingFeeCents);
  await sendEmail({
    to: c.guestEmail!,
    subject: `Receipt ${receipt}: thank you for backing ${title}`,
    text: `Thank you for backing "${title}".\n\n${thanks}\n\nReceipt: ${receipt}\nTotal charged: ${total} (simulated payment)\n\nYour contribution pays for promoting this message. It is not a donation to the cause.`,
  });
}

export async function cancelContribution(payer: Payer, id: string) {
  await loadOwn(payer, id);
  await prisma.contribution.updateMany({
    where: { id, status: "pending" },
    data: { status: "cancelled", failureReason: "You cancelled this payment. You were not charged." },
  });
  return getContribution(payer, id);
}

// ─── Receipts & history ───────────────────────────────────────────────────────

/** The signed-in owner, or the guest holding this payment's receipt key. Anyone else gets "not found". */
function owns(c: Contribution, payer: Payer) {
  return c.userId ? c.userId === payer.userId : sameToken(c.guestToken, payer.guestToken);
}

async function loadOwn(payer: Payer, id: string) {
  const contribution = await prisma.contribution.findUnique({ where: { id } });
  if (!contribution || !owns(contribution, payer)) throw AppError.notFound("Contribution not found.");
  return contribution;
}

export async function getContribution(payer: Payer, id: string) {
  const c = await prisma.contribution.findUnique({
    where: { id },
    include: { campaign: true },
  });
  if (!c || !owns(c, payer)) throw AppError.notFound("Contribution not found.");

  const stats = await getStatsFor(c.campaignId);
  return {
    ...toContributionView(c, c.campaign),
    // Updated progress for the confirmation screen
    campaignFunding: toCampaignCard(c.campaign, stats).funding,
  };
}

export async function listMyContributions(userId: string, limit: number, offset: number) {
  const rows = await prisma.contribution.findMany({
    where: { userId, status: { not: "pending" } },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    skip: offset,
    include: { campaign: { select: campaignRefSelect } },
  });
  return page(
    rows.map((c) => toContributionView(c, c.campaign)),
    limit,
    offset,
  );
}

/** Profile → Backed campaigns: each campaign once, with the user's total. */
export async function listBackedCampaigns(userId: string) {
  const totals = await prisma.contribution.groupBy({
    by: ["campaignId"],
    where: { userId, status: "succeeded" },
    _sum: { amountCents: true },
    _max: { paidAt: true },
  });
  const ids = totals.map((t) => t.campaignId);
  const [campaigns, stats] = await Promise.all([
    prisma.campaign.findMany({ where: { id: { in: ids } } }),
    getStats(ids),
  ]);
  const byId = new Map(campaigns.map((c) => [c.id, c]));

  return totals
    .sort((a, b) => (b._max.paidAt?.getTime() ?? 0) - (a._max.paidAt?.getTime() ?? 0))
    .flatMap((t) => {
      const campaign = byId.get(t.campaignId);
      if (!campaign) return [];
      return [
        {
          ...toCampaignCard(campaign, statsOf(stats, campaign.id)),
          myContributionCents: t._sum.amountCents ?? 0,
          lastBackedAt: t._max.paidAt,
        },
      ];
    });
}
