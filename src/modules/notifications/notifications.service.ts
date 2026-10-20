import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { squareImageUrl } from "../campaigns/campaigns.mapper.js";
import { audienceFor } from "./preferences.js";
import { sendPush } from "./push.service.js";

type Db = Prisma.TransactionClient | typeof prisma;

export type NotificationInput = {
  type: NotificationType;
  campaignId?: string | null;
  title: string;
  body: string;
  /** Identifies the event, e.g. "milestone:50:<campaignId>". The recipient id is appended. */
  eventKey: string;
};

/**
 * Payment notifications are keyed "contribution-succeeded:<contributionId>" (or -failed), so the
 * contribution they are about can be read back without a separate column.
 */
function contributionIdFromKey(key: string) {
  return key.match(/^contribution-(?:succeeded|failed):([^:]+)/)?.[1] ?? null;
}

/**
 * Sends one notification per user (stored for the Activity tab, plus a phone push).
 * Re-sending the same event to the same user is a no-op.
 */
export async function notifyUsers(userIds: string[], input: NotificationInput, db: Db = prisma) {
  // Respect each user's settings: muted categories are skipped, push only where it's switched on
  const { inApp: recipients, push } = await audienceFor([...new Set(userIds)], input.type, db);
  if (recipients.length === 0) return;
  // Only users getting this for the first time are pushed to
  const already = await db.notification.findMany({
    where: { dedupeKey: { in: recipients.map((id) => `${input.eventKey}:${id}`) } },
    select: { userId: true },
  });
  const seen = new Set(already.map((n) => n.userId));
  const fresh = recipients.filter((id) => !seen.has(id) && push.has(id));

  await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      campaignId: input.campaignId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      dedupeKey: `${input.eventKey}:${userId}`,
    })),
    skipDuplicates: true,
  });

  // Off the request path, so a slow push service never delays the response
  const message = {
    title: input.title,
    body: input.body,
    data: { type: input.type, campaignId: input.campaignId ?? null, contributionId: contributionIdFromKey(input.eventKey) },
  };
  setImmediate(() => void sendPush(new Map(fresh.map((id) => [id, message]))));
}

/** The campaign owner plus everyone following it. */
export async function campaignAudience(
  campaignId: string,
  options: { includeOwner?: boolean; excludeUserId?: string } = {},
  db: Db = prisma,
) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { creatorId: true, follows: { select: { userId: true } } },
  });
  if (!campaign) return [];
  const ids = campaign.follows.map((f) => f.userId);
  if (options.includeOwner !== false) ids.push(campaign.creatorId);
  return [...new Set(ids)].filter((id) => id !== options.excludeUserId);
}

// ─── Notification centre (Activity tab) ───────────────────────────────────────

export async function listNotifications(userId: string, limit: number, offset: number) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    skip: offset,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      readAt: true,
      createdAt: true,
      dedupeKey: true,
      campaign: { select: { id: true, slug: true, title: true, coverImageUrl: true, adAssets: true } },
    },
  });
  // Square ad image for the feed thumbnail; the raw asset list stays server-side
  return rows.map(({ campaign, dedupeKey, ...n }) => ({
    ...n,
    contributionId: contributionIdFromKey(dedupeKey),
    campaign: campaign && {
      id: campaign.id,
      slug: campaign.slug,
      title: campaign.title,
      coverImageUrl: campaign.coverImageUrl,
      squareImageUrl: squareImageUrl(campaign),
    },
  }));
}

export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, notificationId: string) {
  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
  if (count === 0) throw AppError.notFound("Notification not found.");
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
