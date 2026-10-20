// Moderation without an admin: the author or the campaign owner can delete,
// any user can report once, and a comment hides itself after enough reports.
import { Prisma, type ReportReason } from "@prisma/client";
import { appConfig } from "../../config/app.config.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { getPublicCampaign } from "../campaigns/campaigns.service.js";
import { notifyUsers } from "../notifications/notifications.service.js";
import { shortName } from "../users/users.mapper.js";

const commentSelect = {
  id: true,
  parentId: true,
  body: true,
  deletedAt: true,
  createdAt: true,
  userId: true,
  user: { select: { fullName: true, avatarUrl: true } },
} as const;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

function toView(c: CommentRow, creatorId: string, viewerId?: string) {
  const deleted = c.deletedAt !== null;
  return {
    id: c.id,
    parentId: c.parentId,
    // Privacy: only a short display name and avatar, never email or backing status
    author: deleted ? null : { name: shortName(c.user.fullName), avatarUrl: c.user.avatarUrl, isCreator: c.userId === creatorId },
    body: deleted ? null : c.body,
    isDeleted: deleted,
    createdAt: c.createdAt,
    canDelete: !deleted && viewerId !== undefined && (viewerId === c.userId || viewerId === creatorId),
  };
}

export async function listComments(campaignId: string, viewerId?: string) {
  const campaign = await getPublicCampaign(campaignId);
  const rows = await prisma.comment.findMany({
    where: { campaignId, hiddenAt: null },
    orderBy: { createdAt: "asc" },
    select: commentSelect,
  });

  const repliesByParent = new Map<string, CommentRow[]>();
  for (const r of rows) {
    if (r.parentId) repliesByParent.set(r.parentId, [...(repliesByParent.get(r.parentId) ?? []), r]);
  }

  return rows
    .filter((r) => r.parentId === null)
    .map((r) => ({
      ...toView(r, campaign.creatorId, viewerId),
      replies: (repliesByParent.get(r.id) ?? [])
        .filter((reply) => reply.deletedAt === null)
        .map((reply) => toView(reply, campaign.creatorId, viewerId)),
    }))
    // A deleted comment stays only as a placeholder for its replies
    .filter((c) => !c.isDeleted || c.replies.length > 0)
    .reverse(); // newest threads first, replies oldest first
}

export async function postComment(userId: string, campaignId: string, body: string, parentId?: string) {
  const campaign = await getPublicCampaign(campaignId);

  if (parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent || parent.campaignId !== campaignId || parent.hiddenAt || parent.deletedAt) {
      throw AppError.badRequest("The comment you're replying to is no longer available.");
    }
    if (parent.parentId) throw AppError.badRequest("Replies can't be nested further.");
  }

  const comment = await prisma.comment.create({
    data: { campaignId, userId, body, parentId: parentId ?? null },
    select: commentSelect,
  });

  if (userId !== campaign.creatorId) {
    await notifyUsers([campaign.creatorId], {
      type: "new_comment",
      campaignId,
      title: `New comment on ${campaign.title}`,
      body: `${shortName(comment.user.fullName)}: ${body.slice(0, 100)}`,
      eventKey: `comment:${comment.id}`,
    });
  }
  return { ...toView(comment, campaign.creatorId, userId), replies: [] };
}

export async function deleteComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { campaign: { select: { creatorId: true } } },
  });
  if (!comment || comment.deletedAt) throw AppError.notFound("Comment not found.");
  if (comment.userId !== userId && comment.campaign.creatorId !== userId) {
    throw AppError.forbidden("You can only delete your own comments, or comments on your campaign.");
  }
  await prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
}

export async function reportComment(userId: string, commentId: string, reason: ReportReason) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.deletedAt || comment.hiddenAt) throw AppError.notFound("Comment not found.");
  if (comment.userId === userId) throw AppError.badRequest("You can't report your own comment.");

  try {
    await prisma.commentReport.create({ data: { commentId, userId, reason } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { reported: true, hidden: false }; // already reported by this user
    }
    throw err;
  }

  const reports = await prisma.commentReport.count({ where: { commentId } });
  const hide = reports >= appConfig.comments.autoHideReports;
  if (hide) {
    await prisma.comment.updateMany({ where: { id: commentId, hiddenAt: null }, data: { hiddenAt: new Date() } });
  }
  return { reported: true, hidden: hide };
}
