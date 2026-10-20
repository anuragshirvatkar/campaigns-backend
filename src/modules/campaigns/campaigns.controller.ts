import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import * as campaigns from "./campaigns.service.js";
import * as mine from "./my-campaigns.service.js";

// ─── Public ───────────────────────────────────────────────────────────────────

export async function list(_req: Request, res: Response) {
  res.json(await campaigns.listCampaigns(res.locals.query));
}

export async function detail(req: Request, res: Response) {
  res.json(await campaigns.getCampaignDetail(req.params.idOrSlug as string, req.userId));
}

// ─── Creator (/me/campaigns) ──────────────────────────────────────────────────

export async function createDraft(req: Request, res: Response) {
  res.status(201).json(await mine.createDraft(currentUserId(req), req.body.creationMode));
}

export async function listMine(req: Request, res: Response) {
  res.json(await mine.listMyCampaigns(currentUserId(req), res.locals.query.tab));
}

export async function getMine(req: Request, res: Response) {
  res.json(await mine.getMyCampaign(currentUserId(req), req.params.id as string));
}

export async function updateMine(req: Request, res: Response) {
  res.json(await mine.updateMyCampaign(currentUserId(req), req.params.id as string, req.body));
}

export async function deleteMine(req: Request, res: Response) {
  await mine.deleteMyDraft(currentUserId(req), req.params.id as string);
  res.status(204).end();
}

export async function submitMine(req: Request, res: Response) {
  res.json(await mine.submitMyCampaign(currentUserId(req), req.params.id as string));
}

export async function cancelMine(req: Request, res: Response) {
  res.json(await mine.cancelMyCampaign(currentUserId(req), req.params.id as string));
}
