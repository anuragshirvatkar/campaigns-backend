import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import { page } from "../../utils/pagination.js";
import * as service from "./notifications.service.js";
import * as push from "./push.service.js";

export async function list(req: Request, res: Response) {
  const { limit, offset } = res.locals.query;
  const rows = await service.listNotifications(currentUserId(req), limit, offset);
  res.json(page(rows, limit, offset));
}

export async function unreadCount(req: Request, res: Response) {
  res.json({ count: await service.unreadCount(currentUserId(req)) });
}

export async function markRead(req: Request, res: Response) {
  await service.markRead(currentUserId(req), req.params.id as string);
  res.status(204).end();
}

export async function markAllRead(req: Request, res: Response) {
  await service.markAllRead(currentUserId(req));
  res.status(204).end();
}

export async function savePushToken(req: Request, res: Response) {
  await push.savePushToken(currentUserId(req), req.body.token);
  res.status(204).end();
}

export async function removePushToken(req: Request, res: Response) {
  await push.removePushToken(currentUserId(req), req.body.token);
  res.status(204).end();
}
