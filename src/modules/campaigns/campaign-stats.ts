import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

type Db = Prisma.TransactionClient | typeof prisma;

export type CampaignStats = {
  raisedCents: number;
  backerCount: number;
  /** The ad share of every succeeded contribution (contribution minus platform fee). */
  adBudgetCents: number;
};

const EMPTY: CampaignStats = { raisedCents: 0, backerCount: 0, adBudgetCents: 0 };

/**
 * Funding totals are never stored on the campaign; they are always computed from
 * succeeded contributions, so they can't drift from the payment records.
 */
export async function getStats(campaignIds: string[], db: Db = prisma) {
  const result = new Map<string, CampaignStats>();
  if (campaignIds.length === 0) return result;

  const rows = await db.$queryRaw<
    { campaign_id: string; raised: number; backers: number; ad_budget: number }[]
  >`
    SELECT campaign_id,
           SUM(amount_cents)::int                AS raised,
           -- each account counts once; each guest payment is its own backer
           (COUNT(DISTINCT user_id) + COUNT(*) FILTER (WHERE user_id IS NULL))::int AS backers,
           SUM(amount_cents - fee_cents)::int    AS ad_budget
    FROM contributions
    WHERE status = 'succeeded' AND campaign_id = ANY(${campaignIds}::uuid[])
    GROUP BY campaign_id`;

  for (const r of rows) {
    result.set(r.campaign_id, {
      raisedCents: r.raised,
      backerCount: r.backers,
      adBudgetCents: r.ad_budget,
    });
  }
  return result;
}

export async function getStatsFor(campaignId: string, db: Db = prisma) {
  return (await getStats([campaignId], db)).get(campaignId) ?? EMPTY;
}

export function statsOf(map: Map<string, CampaignStats>, campaignId: string) {
  return map.get(campaignId) ?? EMPTY;
}
