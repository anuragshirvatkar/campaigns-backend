// Public side of campaigns: feed, Explore and the campaign page. No login required.
import { Prisma, type Campaign } from "@prisma/client";
import type { z } from "zod";
import { PUBLIC_STATUSES } from "../../config/app.config.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { page } from "../../utils/pagination.js";
import { shortName } from "../users/users.mapper.js";
import { getStats, getStatsFor, statsOf } from "./campaign-stats.js";
import { toCampaignCard, toCampaignDetail } from "./campaigns.mapper.js";
import type { listCampaignsQuery } from "./campaigns.schema.js";

type ListQuery = z.infer<typeof listCampaignsQuery>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listCampaigns(query: ListQuery) {
  const { q, category, status, featured, sort, limit, offset } = query;

  // Sorting by funding needs the live totals, so ids are picked in SQL and rows loaded after
  const where: Prisma.Sql[] = [Prisma.sql`c.status::text IN (${Prisma.join([...PUBLIC_STATUSES])})`];
  if (status) where.push(Prisma.sql`c.status::text = ${status}`);
  if (sort === "ending_soon" || sort === "nearly_funded") where.push(Prisma.sql`c.status = 'funding'`);
  if (category) where.push(Prisma.sql`c.category::text = ${category}`);
  if (featured !== undefined) where.push(Prisma.sql`c.is_featured = ${featured}`);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    where.push(Prisma.sql`(c.title ILIKE ${like} OR c.summary ILIKE ${like} OR c.creator_name ILIKE ${like})`);
  }

  const orderBy = {
    // Featured campaigns are pinned to the top of the default feed
    newest: Prisma.sql`c.is_featured DESC, c.published_at DESC NULLS LAST`,
    most_funded: Prisma.sql`COALESCE(s.raised, 0) DESC`,
    ending_soon: Prisma.sql`c.funding_deadline ASC NULLS LAST`,
    nearly_funded: Prisma.sql`COALESCE(s.raised, 0)::float / NULLIF(c.funding_goal_cents, 0) DESC NULLS LAST`,
  }[sort];

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id
    FROM campaigns c
    LEFT JOIN (
      SELECT campaign_id, SUM(amount_cents) AS raised
      FROM contributions WHERE status = 'succeeded' GROUP BY campaign_id
    ) s ON s.campaign_id = c.id
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY ${orderBy}, c.created_at DESC
    LIMIT ${limit + 1} OFFSET ${offset}`;

  const ids = rows.map((r) => r.id);
  const [campaigns, stats] = await Promise.all([
    prisma.campaign.findMany({ where: { id: { in: ids } } }),
    getStats(ids),
  ]);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const ordered = ids.map((id) => byId.get(id)).filter((c): c is Campaign => Boolean(c));

  return page(
    ordered.map((c) => toCampaignCard(c, statsOf(stats, c.id))),
    limit,
    offset,
  );
}

export async function findCampaign(idOrSlug: string) {
  return prisma.campaign.findFirst({
    where: UUID_RE.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
  });
}

export function isPublic(c: Campaign) {
  return (PUBLIC_STATUSES as readonly string[]).includes(c.status);
}

/** Loads a campaign that the viewer is allowed to see (public, or their own). */
export async function getVisibleCampaign(idOrSlug: string, viewerId?: string) {
  const campaign = await findCampaign(idOrSlug);
  if (!campaign || (!isPublic(campaign) && campaign.creatorId !== viewerId)) {
    throw AppError.notFound("Campaign not found.");
  }
  return campaign;
}

/** Loads a campaign that is live (public), for actions like following or commenting. */
export async function getPublicCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign || !isPublic(campaign)) throw AppError.notFound("Campaign not found.");
  return campaign;
}

export async function getCampaignDetail(idOrSlug: string, viewerId?: string) {
  const campaign = await getVisibleCampaign(idOrSlug, viewerId);
  const id = campaign.id;

  const [stats, publicBackers, followerCount, updatesCount, commentsCount, viewer] = await Promise.all([
    getStatsFor(id),
    prisma.contribution.findMany({
      where: { campaignId: id, status: "succeeded", isPublic: true, userId: { not: null } }, // guests are never listed
      orderBy: { paidAt: "desc" },
      take: 5,
      select: { amountCents: true, paidAt: true, user: { select: { fullName: true } } },
    }),
    prisma.follow.count({ where: { campaignId: id } }),
    prisma.campaignUpdate.count({ where: { campaignId: id } }),
    prisma.comment.count({ where: { campaignId: id, hiddenAt: null, deletedAt: null } }),
    viewerId ? viewerState(id, viewerId) : null,
  ]);

  return {
    ...toCampaignDetail(campaign, stats),
    // Backers are private unless they chose to be listed
    publicBackers: publicBackers.map((b) => ({
      name: shortName(b.user?.fullName ?? ""),
      amountCents: b.amountCents,
      paidAt: b.paidAt,
    })),
    counts: {
      followers: followerCount,
      updates: updatesCount,
      comments: commentsCount,
    },
    viewer: viewer && { ...viewer, isOwner: campaign.creatorId === viewerId },
  };
}

async function viewerState(campaignId: string, userId: string) {
  const [follow, feedback, backed] = await Promise.all([
    prisma.follow.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
    }),
    prisma.feedbackResponse.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    }),
    prisma.contribution.count({
      where: { campaignId, userId, status: "succeeded" },
    }),
  ]);
  return {
    isFollowing: Boolean(follow),
    hasBacked: backed > 0,
    feedback: feedback && {
      visualsAnswer: feedback.visualsAnswer,
      changedMindAnswer: feedback.changedMindAnswer,
    },
  };
}

