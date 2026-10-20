// Ad delivery numbers. There is no real ad platform in this prototype, so while a campaign
// is promoting the scheduler records simulated delivery each tick, derived from the real
// ad budget with the same CPM / frequency / CTR assumptions as the reach estimate.
// Every row stores running totals per channel; the latest row per channel is the current total.
import type { Campaign } from "@prisma/client";
import { appConfig } from "../../config/app.config.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { formatUsd } from "../../utils/money.js";
import { cpmCentsFor, estimateReach, reachPerDollar } from "../../utils/reach.js";
import { completePromotion } from "../campaigns/campaign-lifecycle.service.js";
import { getStatsFor } from "../campaigns/campaign-stats.js";
import type { Reach } from "../campaigns/campaigns.schema.js";
import { getVisibleCampaign } from "../campaigns/campaigns.service.js";
import { feedbackSummary } from "../feedback/feedback.service.js";
import { campaignAudience, notifyUsers } from "../notifications/notifications.service.js";

const { lifecycle, reach: reachModel, channels: ALL_CHANNELS } = appConfig;

// Channels price differently; small multipliers keep the per-channel numbers believable
const CHANNEL_CPM_FACTOR: Record<string, number> = { facebook: 0.95, instagram: 1.1 };

const jitter = (spread = 0.06) => 1 + (Math.random() * 2 - 1) * spread;

function channelSplit(c: Campaign) {
  const reach = (c.reach ?? {}) as Partial<Reach>;
  const channels = reach.channels?.length ? reach.channels : [...ALL_CHANNELS];
  const split = reach.budgetSplit ?? {};
  const total = channels.reduce((sum, ch) => sum + (split[ch] ?? 0), 0);
  return channels.map((ch) => ({
    channel: ch,
    share: total > 0 ? (split[ch] ?? 0) / total : 1 / channels.length,
  }));
}

// ─── Simulated delivery (scheduler) ───────────────────────────────────────────

export async function recordPromotionTicks(now = new Date()) {
  // Seeded demo campaigns come with their own delivery history and stay as they are
  const promoting = await prisma.campaign.findMany({ where: { status: "promoting", isDemo: false } });
  for (const c of promoting) await recordTick(c, now);
}

async function recordTick(c: Campaign, now: Date) {
  const ticks = await prisma.distributionMetric.groupBy({
    by: ["recordedAt"],
    where: { campaignId: c.id },
    orderBy: { recordedAt: "desc" },
  });
  const lastAt = ticks[0]?.recordedAt ?? c.promotingAt ?? c.statusChangedAt;
  if (now.getTime() - lastAt.getTime() < lifecycle.metricsTickSec * 1000) return;

  const tickNo = ticks.length + 1;
  const isFinal = tickNo >= lifecycle.promotionTicks;
  const { adBudgetCents } = await getStatsFor(c.id);
  const baseCpm = cpmCentsFor(c.category);

  const rows = [];
  for (const { channel, share } of channelSplit(c)) {
    const prev = await prisma.distributionMetric.findFirst({
      where: { campaignId: c.id, channel },
      orderBy: { recordedAt: "desc" },
    });
    const budget = Math.round(adBudgetCents * share);
    const planned = isFinal ? budget : Math.round(((budget * tickNo) / lifecycle.promotionTicks) * jitter());
    const spend = Math.min(budget, Math.max(prev?.adSpendCents ?? 0, planned));

    const cpm = baseCpm * (CHANNEL_CPM_FACTOR[channel] ?? 1);
    const impressions = Math.max(prev?.impressions ?? 0, Math.round((spend / cpm) * 1000 * jitter(0.04)));
    rows.push({
      campaignId: c.id,
      channel,
      recordedAt: now,
      adSpendCents: spend,
      impressions,
      reach: Math.max(prev?.reach ?? 0, Math.round(impressions / reachModel.frequency)),
      clicks: Math.max(prev?.clicks ?? 0, Math.round(impressions * reachModel.ctr * jitter(0.15))),
    });
  }
  await prisma.distributionMetric.createMany({ data: rows });

  if (tickNo === Math.ceil(lifecycle.promotionTicks / 2)) {
    const reached = rows.reduce((sum, r) => sum + r.reach, 0);
    await notifyUsers(await campaignAudience(c.id), {
      type: "distribution_progress",
      campaignId: c.id,
      title: `${c.title} has reached about ${reached.toLocaleString("en-US")} people`,
      body: "Measured by the ad platform so far. The promotion is about halfway through its budget.",
      eventKey: `progress:half:${c.id}`,
    });
  }
  if (isFinal) await completePromotion(c, now);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

/**
 * Final / live distribution report. Measured delivery and the pre-launch estimate are
 * returned in separate fields and are never mixed.
 */
export async function getReport(idOrSlug: string, viewerId?: string) {
  const c = await getVisibleCampaign(idOrSlug, viewerId);
  const [stats, metrics] = await Promise.all([
    getStatsFor(c.id),
    prisma.distributionMetric.findMany({ where: { campaignId: c.id }, orderBy: { recordedAt: "asc" } }),
  ]);

  // Latest running totals per channel
  const latest = new Map<string, (typeof metrics)[number]>();
  for (const m of metrics) latest.set(m.channel, m);
  const byChannel = [...latest.values()].map((m) => ({
    channel: m.channel,
    adSpendCents: m.adSpendCents,
    impressions: m.impressions,
    clicks: m.clicks,
    reach: m.reach,
  }));
  const sum = (key: "adSpendCents" | "impressions" | "clicks" | "reach") =>
    byChannel.reduce((total, ch) => total + ch[key], 0);

  // Totals across channels at each reporting point, for the progress chart
  const series = new Map<number, { at: Date; adSpendCents: number; impressions: number; reach: number; clicks: number }>();
  for (const m of metrics) {
    const key = m.recordedAt.getTime();
    const point = series.get(key) ?? { at: m.recordedAt, adSpendCents: 0, impressions: 0, reach: 0, clicks: 0 };
    point.adSpendCents += m.adSpendCents;
    point.impressions += m.impressions;
    point.reach += m.reach;
    point.clicks += m.clicks;
    series.set(key, point);
  }

  const impressions = sum("impressions");
  const spent = sum("adSpendCents");
  return {
    campaign: { id: c.id, slug: c.slug, title: c.title, status: c.status },
    isSimulated: true,
    isFinal: c.status === "completed",
    hasDelivery: metrics.length > 0,
    promotingAt: c.promotingAt,
    completedAt: c.completedAt,
    funds: {
      raisedCents: stats.raisedCents,
      backerCount: stats.backerCount,
      platformFeeCents: stats.raisedCents - stats.adBudgetCents,
      adBudgetCents: stats.adBudgetCents,
      adSpentCents: spent,
    },
    measured: {
      impressions,
      clicks: sum("clicks"),
      // Summed per channel; people who saw it on both channels may be counted twice
      reach: sum("reach"),
      clickThroughRatePct: impressions > 0 ? Math.round((sum("clicks") / impressions) * 1000) / 10 : 0,
    },
    estimate: {
      reachForRaised: estimateReach(stats.raisedCents, c.reachPerDollar ?? reachPerDollar(c.category)),
      note: "Estimated before launch from the reach model; shown for comparison only.",
    },
    byChannel,
    series: [...series.values()],
  };
}

export async function getAnalytics(userId: string, campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.creatorId !== userId) throw AppError.notFound("Campaign not found.");

  const [report, contributions, followers, feedback] = await Promise.all([
    getReport(c.id, userId),
    prisma.contribution.findMany({
      where: { campaignId: c.id, status: "succeeded" },
      orderBy: { paidAt: "asc" },
      select: { amountCents: true, paidAt: true },
    }),
    prisma.follow.count({ where: { campaignId: c.id } }),
    feedbackSummary(c.id),
  ]);

  // Cumulative funding per day
  const byDay = new Map<string, { raisedCents: number; contributions: number }>();
  for (const ct of contributions) {
    const day = (ct.paidAt ?? new Date()).toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { raisedCents: 0, contributions: 0 };
    entry.raisedCents += ct.amountCents;
    entry.contributions += 1;
    byDay.set(day, entry);
  }
  let running = 0;
  const fundingOverTime = [...byDay.entries()].map(([day, entry]) => {
    running += entry.raisedCents;
    return { day, ...entry, cumulativeCents: running };
  });

  const goal = c.fundingGoalCents ?? 0;
  return {
    ...report,
    funding: {
      raisedCents: report.funds.raisedCents,
      goalCents: c.fundingGoalCents,
      percentFunded: goal > 0 ? Math.floor((report.funds.raisedCents / goal) * 100) : 0,
      contributionCount: contributions.length,
      backerCount: report.funds.backerCount,
      followerCount: followers,
      milestonesReached: appConfig.funding.milestonesPct.filter(
        (pct) => goal > 0 && report.funds.raisedCents >= (goal * pct) / 100,
      ),
      fundingOverTime,
      summary: `${formatUsd(report.funds.raisedCents)} raised from ${report.funds.backerCount} backers`,
    },
    duration: {
      days: c.durationDays,
      publishedAt: c.publishedAt,
      deadline: c.fundingDeadline,
      promotingAt: c.promotingAt,
      completedAt: c.completedAt,
    },
    feedback,
  };
}
