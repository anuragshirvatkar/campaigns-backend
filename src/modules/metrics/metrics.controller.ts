import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import * as service from "./metrics.service.js";

export async function report(req: Request, res: Response) {
  res.json(await service.getReport(req.params.idOrSlug as string, req.userId));
}

export async function analytics(req: Request, res: Response) {
  res.json(await service.getAnalytics(currentUserId(req), req.params.id as string));
}
