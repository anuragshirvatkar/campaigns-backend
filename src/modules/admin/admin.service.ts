// The admin's side: the review queue (approve, ask for changes, reject) and platform-wide analytics.
import type { Campaign, CampaignStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { applyReviewDecision } from "../campaigns/campaign-lifecycle.service.js";
import { getStats, getStatsFor, statsOf } from "../campaigns/campaign-stats.js";
import { toCampaignCard, toCampaignDetail } from "../campaigns/campaigns.mapper.js";
import type { AdminTab, ReviewBody } from "./admin.schema.js";

const TAB_STATUSES: Record<AdminTab, CampaignStatus[]> = {
  pending: ["submitted"],
  changes_requested: ["changes_requested"],
  // Everything that passed review and went on through the lifecycle
  approved: ["approved", "funding", "funded", "funding_ended", "distribution_prep", "promoting", "completed"],
  rejected: ["rejected"],
};

const DEFAULT_SUMMARY: Record<ReviewBody["decision"], string> = {
  approved: "Your campaign meets the content and advertising rules.",
  changes_requested: "Your campaign is nearly ready. Fix the points below and resubmit.",
  rejected: "This campaign can't run on the platform.",
};

type AiReview = { decision: string; summary: string; issues: { field?: string; step: number; message: string }[]; reviewer: string; at: string };

const creatorSelect = { id: true, fullName: true, email: true, avatarUrl: true, createdAt: true } as const;

// ─── Review queue ─────────────────────────────────────────────────────────────

export async function listCampaigns(tab: AdminTab) {
  const [campaigns, grouped] = await Promise.all([
    prisma.campaign.findMany({
      where: { status: { in: TAB_STATUSES[tab] } },
      include: { creator: { select: creatorSelect }, _count: { select: { reviews: true } } },
      // The queue is first come, first served; decided campaigns show the latest decision first
      orderBy: tab === "pending" ? { submittedAt: "asc" } : { reviewedAt: "desc" },
      take: 200,
    }),
    prisma.campaign.groupBy({ by: ["status"], _count: true, where: { status: { not: "draft" } } }),
  ]);
  const stats = await getStats(campaigns.map((c) => c.id));

  const counts = Object.fromEntries(
    Object.entries(TAB_STATUSES).map(([key, statuses]) => [
      key,
      grouped.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count, 0),
    ]),
  ) as Record<AdminTab, number>;

  return {
    counts,
    items: campaigns.map((c) => ({
      ...toCampaignCard(c, statsOf(stats, c.id)),
      creator: c.creator,
      submittedAt: c.submittedAt,
      reviewedAt: c.reviewedAt,
      // Was live before, or was reviewed before: the admin sees it is a resubmission
      isResubmission: c.publishedAt !== null || c._count.reviews > 0,
      aiSuggestion: suggestionOf(c),
    })),
  };
}

function suggestionOf(c: Campaign) {
  const ai = c.aiReview as AiReview | null;
  return ai && { decision: ai.decision, summary: ai.summary, issues: ai.issues, reviewer: ai.reviewer, at: ai.at };
}

export async function getCampaign(id: string) {
  const c = await prisma.campaign.findUnique({
    where: { id },
    include: {
      creator: { select: creatorSelect },
      reviews: { orderBy: { createdAt: "desc" } },
      _count: { select: { follows: true, comments: true } },
    },
  });
  if (!c || c.status === "draft") throw AppError.notFound("Campaign not found.");
  const [stats, creatorCampaigns] = await Promise.all([
    getStatsFor(c.id),
    prisma.campaign.count({ where: { creatorId: c.creatorId, status: { not: "draft" } } }),
  ]);
  return {
    ...toCampaignDetail(c, stats),
    creator: { ...c.creator, campaignCount: creatorCampaigns },
    reviewedAt: c.reviewedAt,
    isResubmission: c.publishedAt !== null || c.reviews.length > 0,
    canReject: c.publishedAt === null,
    counts: { followers: c._count.follows, comments: c._count.comments },
    aiSuggestion: suggestionOf(c),
    reviews: c.reviews.map((r) => ({
      decision: r.decision,
      summary: r.summary,
      issues: r.issues,
      reviewer: r.reviewer,
      at: r.createdAt,
    })),
  };
}

export async function reviewCampaign(id: string, body: ReviewBody) {
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) throw AppError.notFound("Campaign not found.");
  if (c.status !== "submitted") throw AppError.conflict("This campaign isn't waiting for review any more.");

  const done = await applyReviewDecision(c, {
    decision: body.decision,
    summary: body.note || DEFAULT_SUMMARY[body.decision],
    issues: body.decision === "approved" ? [] : body.issues.map((i) => ({ field: "admin", ...i })),
    reviewer: "admin",
  });
  if (!done) throw AppError.conflict("The creator changed this campaign just now. Open it again to review the latest version.");
  return getCampaign(id);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** Where a period starts: N days back, or (all time) the day of the first sign-up, payment or submission. */
async function periodStart(days: number | null) {
  if (days) {
    const since = new Date(Date.now() - (days - 1) * DAY);
    since.setUTCHours(0, 0, 0, 0);
    return since;
  }
  const [first] = await prisma.$queryRaw<{ at: Date | null }[]>`
    SELECT LEAST(
      (SELECT MIN(created_at) FROM users WHERE role = 'user'),
      (SELECT MIN(paid_at) FROM contributions WHERE status = 'succeeded'),
      (SELECT MIN(submitted_at) FROM campaigns)
    ) AS at`;
  const since = first?.at ?? new Date(Date.now() - 29 * DAY);
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

/** days = 7 | 30 | 90, or null for all time (no previous period to compare with). */
export async function getAnalytics(days: number | null) {
  const since = await periodStart(days);
  const prevSince = days ? new Date(since.getTime() - days * DAY) : null;
  // Long periods are charted per week so the bars stay readable
  const spanDays = Math.ceil((Date.now() - since.getTime()) / DAY);
  const bucket = spanDays > 92 ? "week" : "day";
  const step = bucket === "week" ? "7 days" : "1 day";

  const [
    users,
    newUsers,
    prevNewUsers,
    statusRows,
    money,
    prevMoney,
    payments,
    daily,
    categories,
    delivery,
    reviewRows,
    reviewTime,
    follows,
    comments,
    feedback,
    top,
    agreement,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "user" } }),
    prisma.user.count({ where: { role: "user", createdAt: { gte: since } } }),
    prevSince ? prisma.user.count({ where: { role: "user", createdAt: { gte: prevSince, lt: since } } }) : null,
    prisma.campaign.groupBy({ by: ["status"], _count: true }),
    prisma.$queryRaw<{ raised: number; fees: number; count: number; backers: number }[]>`
      SELECT COALESCE(SUM(amount_cents), 0)::int AS raised,
             COALESCE(SUM(fee_cents), 0)::int    AS fees,
             COUNT(*)::int                       AS count,
             (COUNT(DISTINCT user_id) + COUNT(*) FILTER (WHERE user_id IS NULL))::int AS backers
      FROM contributions WHERE status = 'succeeded' AND paid_at >= ${since}`,
    prevSince
      ? prisma.$queryRaw<{ raised: number; count: number }[]>`
          SELECT COALESCE(SUM(amount_cents), 0)::int AS raised, COUNT(*)::int AS count
          FROM contributions WHERE status = 'succeeded' AND paid_at >= ${prevSince} AND paid_at < ${since}`
      : null,
    prisma.contribution.groupBy({ by: ["status"], _count: true, where: { createdAt: { gte: since } } }),
    prisma.$queryRaw<{ day: Date; raised: number; contributions: number; signups: number; submissions: number }[]>`
      WITH b AS (
        SELECT generate_series(date_trunc(${bucket}, ${since}::timestamptz), now(), ${step}::interval) AS day
      )
      SELECT b.day,
        COALESCE((SELECT SUM(amount_cents) FROM contributions c WHERE c.status = 'succeeded' AND c.paid_at >= b.day AND c.paid_at < b.day + ${step}::interval), 0)::int AS raised,
        (SELECT COUNT(*) FROM contributions c WHERE c.status = 'succeeded' AND c.paid_at >= b.day AND c.paid_at < b.day + ${step}::interval)::int AS contributions,
        (SELECT COUNT(*) FROM users u WHERE u.role = 'user' AND u.created_at >= b.day AND u.created_at < b.day + ${step}::interval)::int AS signups,
        (SELECT COUNT(*) FROM campaigns p WHERE p.submitted_at >= b.day AND p.submitted_at < b.day + ${step}::interval)::int AS submissions
      FROM b ORDER BY b.day`,
    prisma.$queryRaw<{ category: string; campaigns: number; raised: number }[]>`
      SELECT p.category::text AS category,
             COUNT(DISTINCT p.id)::int AS campaigns,
             COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'succeeded'), 0)::int AS raised
      FROM campaigns p LEFT JOIN contributions c ON c.campaign_id = p.id
      WHERE p.status NOT IN ('draft', 'rejected') AND p.category IS NOT NULL
      GROUP BY p.category ORDER BY raised DESC, campaigns DESC`,
    // Latest running totals per campaign and channel = what each channel has delivered
    prisma.$queryRaw<{ channel: string; spend: number; impressions: number; clicks: number; reach: number }[]>`
      SELECT channel, SUM(ad_spend_cents)::int AS spend, SUM(impressions)::int AS impressions,
             SUM(clicks)::int AS clicks, SUM(reach)::int AS reach
      FROM (
        SELECT DISTINCT ON (campaign_id, channel) campaign_id, channel, ad_spend_cents, impressions, clicks, reach
        FROM distribution_metrics ORDER BY campaign_id, channel, recorded_at DESC
      ) latest GROUP BY channel ORDER BY channel`,
    prisma.campaignReview.groupBy({ by: ["decision"], _count: true, where: { createdAt: { gte: since } } }),
    prisma.$queryRaw<{ hours: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600)::float AS hours
      FROM campaigns WHERE reviewed_at IS NOT NULL AND submitted_at IS NOT NULL AND reviewed_at >= ${since}`,
    prisma.follow.count(),
    prisma.comment.count({ where: { deletedAt: null } }),
    prisma.feedbackResponse.groupBy({ by: ["changedMindAnswer"], _count: true }),
    prisma.$queryRaw<{ id: string; raised: number; backers: number }[]>`
      SELECT campaign_id AS id, SUM(amount_cents)::int AS raised,
             (COUNT(DISTINCT user_id) + COUNT(*) FILTER (WHERE user_id IS NULL))::int AS backers
      FROM contributions WHERE status = 'succeeded'
      GROUP BY campaign_id ORDER BY raised DESC LIMIT 5`,
    // Admin decisions where the AI pre-screen had run: how often the admin made the same call
    prisma.$queryRaw<{ total: number; agreed: number }[]>`
      SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE decision = ai_decision)::int AS agreed
      FROM campaign_reviews WHERE reviewer = 'admin' AND ai_decision IS NOT NULL AND created_at >= ${since}`,
  ]);

  const statusCount = (statuses: CampaignStatus[]) =>
    statusRows.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r._count, 0);
  const paymentCount = (status: string) => payments.find((p) => p.status === status)?._count ?? 0;
  const decisions = (d: string) => reviewRows.find((r) => r.decision === d)?._count ?? 0;

  const topCampaigns = await prisma.campaign.findMany({ where: { id: { in: top.map((t) => t.id) } } });
  const allTimeRaised = await prisma.contribution.aggregate({ _sum: { amountCents: true }, where: { status: "succeeded" } });

  const m = money[0]!;
  const pm = prevMoney?.[0] ?? null;
  const ag = agreement[0]!;
  const totals = delivery.reduce(
    (acc, d) => ({
      spend: acc.spend + d.spend,
      impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
      reach: acc.reach + d.reach,
    }),
    { spend: 0, impressions: 0, clicks: 0, reach: 0 },
  );
  const succeeded = paymentCount("succeeded");
  const attempted = payments.reduce((sum, p) => sum + p._count, 0);
  const decided = decisions("approved") + decisions("changes_requested") + decisions("rejected");

  return {
    days,
    since: since.toISOString().slice(0, 10),
    bucket,
    // Headline numbers for the period, each with the previous period for the trend arrow (null for all time)
    kpis: {
      raisedCents: m.raised,
      prevRaisedCents: pm?.raised ?? null,
      contributions: m.count,
      prevContributions: pm?.count ?? null,
      backers: m.backers,
      avgContributionCents: m.count ? Math.round(m.raised / m.count) : 0,
      platformFeeCents: m.fees,
      newUsers,
      prevNewUsers,
    },
    allTime: {
      raisedCents: allTimeRaised._sum.amountCents ?? 0,
      users,
      campaigns: statusCount(statusRows.map((r) => r.status).filter((s) => s !== "draft")),
      live: statusCount(["funding"]),
      promoting: statusCount(["funded", "funding_ended", "distribution_prep", "promoting"]),
      completed: statusCount(["completed"]),
      drafts: statusCount(["draft"]),
    },
    review: {
      pending: statusCount(["submitted"]),
      changesRequested: statusCount(["changes_requested"]),
      rejected: statusCount(["rejected"]),
      decisions: {
        approved: decisions("approved"),
        changesRequested: decisions("changes_requested"),
        rejected: decisions("rejected"),
      },
      approvalRatePct: decided ? Math.round((decisions("approved") / decided) * 100) : null,
      avgReviewHours: reviewTime[0]?.hours ?? null,
      // Of the admin's decisions with an AI suggestion, the share that matched it
      aiAgreement: { decisions: ag.total, agreedPct: ag.total ? Math.round((ag.agreed / ag.total) * 100) : null },
    },
    statuses: statusRows.map((r) => ({ status: r.status, count: r._count })).sort((a, b) => b.count - a.count),
    daily: daily.map((d) => ({
      date: d.day.toISOString().slice(0, 10),
      raisedCents: d.raised,
      contributions: d.contributions,
      signups: d.signups,
      submissions: d.submissions,
    })),
    categories,
    payments: {
      succeeded,
      failed: paymentCount("failed") + paymentCount("rejected"),
      cancelled: paymentCount("cancelled"),
      pending: paymentCount("pending"),
      successRatePct: attempted ? Math.round((succeeded / attempted) * 100) : null,
    },
    delivery: {
      ...totals,
      ctrPct: totals.impressions ? Math.round((totals.clicks / totals.impressions) * 10_000) / 100 : 0,
      channels: delivery,
    },
    // How far campaigns get, all time
    funnel: [
      { key: "submitted", label: "Submitted", count: statusCount(statusRows.map((r) => r.status).filter((s) => s !== "draft")) },
      { key: "approved", label: "Approved", count: statusCount(TAB_STATUSES.approved) },
      { key: "funded", label: "Funded", count: statusCount(["funded", "funding_ended", "distribution_prep", "promoting", "completed"]) },
      { key: "completed", label: "Completed", count: statusCount(["completed"]) },
    ],
    engagement: {
      follows,
      comments,
      // "Did this campaign change your mind?"
      feedback: {
        yes: feedback.find((f) => f.changedMindAnswer === "yes")?._count ?? 0,
        somewhat: feedback.find((f) => f.changedMindAnswer === "somewhat")?._count ?? 0,
        no: feedback.find((f) => f.changedMindAnswer === "no")?._count ?? 0,
      },
    },
    topCampaigns: top
      .map((t) => {
        const c = topCampaigns.find((x) => x.id === t.id);
        return (
          c && {
            id: c.id,
            title: c.title,
            status: c.status,
            category: c.category,
            imageUrl: c.coverImageUrl,
            raisedCents: t.raised,
            goalCents: c.fundingGoalCents,
            backers: t.backers,
          }
        );
      })
      .filter(Boolean),
  };
}
