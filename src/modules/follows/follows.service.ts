import { prisma } from "../../lib/prisma.js";
import { getStats, statsOf } from "../campaigns/campaign-stats.js";
import { toCampaignCard } from "../campaigns/campaigns.mapper.js";
import { getPublicCampaign } from "../campaigns/campaigns.service.js";

export async function follow(userId: string, campaignId: string) {
  await getPublicCampaign(campaignId);
  await prisma.follow.upsert({
    where: { userId_campaignId: { userId, campaignId } },
    create: { userId, campaignId },
    update: {},
  });
}

export async function unfollow(userId: string, campaignId: string) {
  await prisma.follow.deleteMany({ where: { userId, campaignId } });
}

/** Activity → Followed campaigns and Profile → Following. */
export async function listFollowed(userId: string) {
  const follows = await prisma.follow.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { campaign: true },
  });
  const stats = await getStats(follows.map((f) => f.campaignId));
  return follows.map((f) => ({
    ...toCampaignCard(f.campaign, statsOf(stats, f.campaignId)),
    followedAt: f.createdAt,
  }));
}
