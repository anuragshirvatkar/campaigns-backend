// Notification preferences: which kinds of events a user hears about, and whether they also come
// as phone pushes. In-app Activity always keeps security alerts; nothing else is mandatory.
import type { NotificationType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

export const CATEGORIES = ["my_campaigns", "funding", "payments", "promotion", "updates"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Each notification type belongs to one category; security alerts belong to none (always sent). */
const CATEGORY_OF: Partial<Record<NotificationType, Category>> = {
  submission_received: "my_campaigns",
  campaign_approved: "my_campaigns",
  campaign_changes_requested: "my_campaigns",
  campaign_rejected: "my_campaigns",
  campaign_live: "updates",
  funding_milestone: "funding",
  deadline_approaching: "funding",
  funding_ended: "funding",
  contribution_succeeded: "payments",
  contribution_failed: "payments",
  promotion_started: "promotion",
  distribution_progress: "promotion",
  campaign_completed: "promotion",
  report_available: "promotion",
  campaign_update: "updates",
  new_comment: "updates",
};

export const preferencesSchema = z.object({
  push: z.boolean(),
  muted: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length),
});
export type Preferences = z.infer<typeof preferencesSchema>;

const DEFAULTS: Preferences = { push: true, muted: [] };

export function readPreferences(raw: Prisma.JsonValue | null | undefined): Preferences {
  const parsed = preferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULTS;
}

export async function getPreferences(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notificationPrefs: true } });
  return readPreferences(user.notificationPrefs);
}

export async function updatePreferences(userId: string, prefs: Preferences) {
  const clean = { push: prefs.push, muted: [...new Set(prefs.muted)] };
  await prisma.user.update({ where: { id: userId }, data: { notificationPrefs: clean } });
  return clean;
}

/**
 * Splits recipients of one notification type by their settings: who gets it at all (in Activity),
 * and who also gets a phone push.
 */
export async function audienceFor(
  userIds: string[],
  type: NotificationType,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const category = CATEGORY_OF[type];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, notificationPrefs: true } });
  const inApp: string[] = [];
  const push = new Set<string>();
  for (const u of users) {
    const prefs = readPreferences(u.notificationPrefs);
    if (category && prefs.muted.includes(category)) continue;
    inApp.push(u.id);
    if (prefs.push || !category) push.add(u.id); // security alerts are always pushed
  }
  return { inApp, push };
}
