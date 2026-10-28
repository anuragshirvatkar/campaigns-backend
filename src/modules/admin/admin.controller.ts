import type { Request, Response } from "express";
import * as admin from "./admin.service.js";

export async function listCampaigns(_req: Request, res: Response) {
  res.json(await admin.listCampaigns(res.locals.query.tab));
}

export async function getCampaign(req: Request, res: Response) {
  res.json(await admin.getCampaign(req.params.id as string));
}

export async function reviewCampaign(req: Request, res: Response) {
  res.json(await admin.reviewCampaign(req.params.id as string, req.body));
}

export async function analytics(_req: Request, res: Response) {
  res.json(await admin.getAnalytics(res.locals.query.days));
}
