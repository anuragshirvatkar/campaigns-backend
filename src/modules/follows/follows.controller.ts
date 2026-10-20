import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import * as service from "./follows.service.js";

export async function follow(req: Request, res: Response) {
  await service.follow(currentUserId(req), req.params.id as string);
  res.json({ isFollowing: true });
}

export async function unfollow(req: Request, res: Response) {
  await service.unfollow(currentUserId(req), req.params.id as string);
  res.json({ isFollowing: false });
}

export async function listMine(req: Request, res: Response) {
  res.json({ items: await service.listFollowed(currentUserId(req)) });
}
