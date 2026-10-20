import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { getPublicCampaign } from "../campaigns/campaigns.service.js";
import { campaignAudience, notifyUsers } from "../notifications/notifications.service.js";

export async function listUpdates(campaignId: string) {
  await getPublicCampaign(campaignId);
  return prisma.campaignUpdate.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, body: true, createdAt: true },
  });
}

export async function postUpdate(userId: string, campaignId: string, title: string, body: string) {
  const campaign = await getPublicCampaign(campaignId);
  if (campaign.creatorId !== userId) throw AppError.forbidden("Only the campaign's creator can post updates.");

  const update = await prisma.campaignUpdate.create({
    data: { campaignId, title, body },
    select: { id: true, title: true, body: true, createdAt: true },
  });

  const followers = await campaignAudience(campaignId, { includeOwner: false });
  await notifyUsers(followers, {
    type: "campaign_update",
    campaignId,
    title: `${campaign.creatorName ?? "The creator"} posted an update`,
    body: title,
    eventKey: `update:${update.id}`,
  });
  return update;
}
