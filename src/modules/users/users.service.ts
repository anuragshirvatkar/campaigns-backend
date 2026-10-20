import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { changePassword } from "../auth/auth.service.js";
import { notifyUsers } from "../notifications/notifications.service.js";
import { toPublicUser } from "./users.mapper.js";
import type { updateMeBody } from "./users.schema.js";

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.unauthorized();

  const [createdCount, backedCount, followingCount] = await Promise.all([
    prisma.campaign.count({ where: { creatorId: userId } }),
    prisma.contribution
      .groupBy({ by: ["campaignId"], where: { userId, status: "succeeded" } })
      .then((rows) => rows.length),
    prisma.follow.count({ where: { userId } }),
  ]);

  return { ...toPublicUser(user), counts: { createdCount, backedCount, followingCount } };
}

export async function updateMe(userId: string, data: z.infer<typeof updateMeBody>) {
  const user = await prisma.user.update({ where: { id: userId }, data });
  return toPublicUser(user);
}

export async function updatePassword(userId: string, currentPassword: string, newPassword: string) {
  await changePassword(userId, currentPassword, newPassword);
  await notifyUsers([userId], {
    type: "security_alert",
    title: "Your password was changed",
    body: "If this wasn't you, change your password again right away and contact support.",
    eventKey: `password-changed:${Date.now()}`,
  });
}
