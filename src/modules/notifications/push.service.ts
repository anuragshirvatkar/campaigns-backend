import { prisma } from "../../lib/prisma.js";

// Expo's push service relays to FCM (Android) / APNs (iOS). This server needs no key, but the FCM V1
// service-account key must be uploaded to EAS (eas credentials) or Android pushes fail with InvalidCredentials.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100; // Expo's per-request limit

export type PushMessage = { title: string; body: string; data?: Record<string, unknown> };

export const isExpoPushToken = (t: string) => /^Expo(nent)?PushToken\[.+\]$/.test(t);

export async function savePushToken(userId: string, token: string) {
  await prisma.pushToken.upsert({ where: { token }, create: { token, userId }, update: { userId } });
}

export async function removePushToken(userId: string, token: string) {
  await prisma.pushToken.deleteMany({ where: { token, userId } });
}

type Ticket = { status: "ok" | "error"; message?: string; details?: { error?: string } };

/**
 * Sends one push per device of each user. Best effort: failures are logged, never thrown,
 * because the in-app notification is already stored and is the source of truth.
 */
export async function sendPush(messagesByUser: Map<string, PushMessage>) {
  if (messagesByUser.size === 0) return;
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId: { in: [...messagesByUser.keys()] } } });
    const messages = tokens.map((t) => ({ to: t.token, sound: "default", channelId: "default", ...messagesByUser.get(t.userId)! }));

    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.warn(`[push] Expo push API responded ${res.status}`);
        continue;
      }
      // Drop tokens of uninstalled apps so we stop sending to them
      const { data } = (await res.json()) as { data: Ticket[] };
      const dead = batch.filter((_, j) => data[j]?.details?.error === "DeviceNotRegistered").map((m) => m.to);
      if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
      // Anything else (e.g. missing FCM credentials) is worth seeing in the logs, once per batch
      const failed = data.find((t) => t.status === "error" && t.details?.error !== "DeviceNotRegistered");
      if (failed) console.warn(`[push] ${data.filter((t) => t.status === "error").length} of ${batch.length} not delivered: ${failed.details?.error ?? ""} ${failed.message ?? ""}`);
    }
  } catch (err) {
    console.warn("[push] send failed:", err instanceof Error ? err.message : err);
  }
}
