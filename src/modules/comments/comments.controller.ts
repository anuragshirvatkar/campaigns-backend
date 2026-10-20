import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import * as service from "./comments.service.js";

export async function list(req: Request, res: Response) {
  res.json({ items: await service.listComments(req.params.id as string, req.userId) });
}

export async function post(req: Request, res: Response) {
  const { body, parentId } = req.body;
  res.status(201).json(await service.postComment(currentUserId(req), req.params.id as string, body, parentId));
}

export async function remove(req: Request, res: Response) {
  await service.deleteComment(currentUserId(req), req.params.id as string);
  res.status(204).end();
}

export async function report(req: Request, res: Response) {
  res.json(await service.reportComment(currentUserId(req), req.params.id as string, req.body.reason));
}
