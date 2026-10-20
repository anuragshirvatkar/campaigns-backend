import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import * as service from "./updates.service.js";

export async function list(req: Request, res: Response) {
  res.json({ items: await service.listUpdates(req.params.id as string) });
}

export async function post(req: Request, res: Response) {
  const { title, body } = req.body;
  res.status(201).json(await service.postUpdate(currentUserId(req), req.params.id as string, title, body));
}
