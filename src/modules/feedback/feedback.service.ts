import { prisma } from "../../lib/prisma.js";
import { getPublicCampaign } from "../campaigns/campaigns.service.js";
import type { FeedbackBody } from "./feedback.schema.js";

export async function saveFeedback(userId: string, campaignId: string, answers: FeedbackBody) {
  await getPublicCampaign(campaignId);
  return prisma.feedbackResponse.upsert({
    where: { campaignId_userId: { campaignId, userId } },
    create: { campaignId, userId, ...answers },
    update: answers,
    select: { visualsAnswer: true, changedMindAnswer: true },
  });
}

type Tally = { no: number; somewhat: number; yes: number; total: number };

/** Counts per answer, for the creator's analytics. */
export async function feedbackSummary(campaignId: string) {
  const rows = await prisma.feedbackResponse.findMany({
    where: { campaignId },
    select: { visualsAnswer: true, changedMindAnswer: true },
  });
  const empty = (): Tally => ({ no: 0, somewhat: 0, yes: 0, total: 0 });
  const visuals = empty();
  const changedMind = empty();
  for (const r of rows) {
    if (r.visualsAnswer) {
      visuals[r.visualsAnswer]++;
      visuals.total++;
    }
    if (r.changedMindAnswer) {
      changedMind[r.changedMindAnswer]++;
      changedMind.total++;
    }
  }
  return { visuals, changedMind };
}
