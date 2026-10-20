import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import * as service from "./feedback.service.js";

export async function save(req: Request, res: Response) {
  res.json(await service.saveFeedback(currentUserId(req), req.params.id as string, req.body));
}
