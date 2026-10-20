import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import * as service from "./contributions.service.js";

/** Signed-in user, or a guest proving ownership with the receipt key from checkout. */
function payer(req: Request): service.Payer {
  const token = req.header("x-guest-token");
  return { userId: req.userId, guestToken: token || undefined };
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createContribution(payer(req), req.body));
}

export async function confirm(req: Request, res: Response) {
  res.json(await service.confirmContribution(payer(req), req.params.id as string, req.body.cardNumber));
}

export async function cancel(req: Request, res: Response) {
  res.json(await service.cancelContribution(payer(req), req.params.id as string));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getContribution(payer(req), req.params.id as string));
}

export async function listMine(req: Request, res: Response) {
  const { limit, offset } = res.locals.query;
  res.json(await service.listMyContributions(currentUserId(req), limit, offset));
}

export async function listBacked(req: Request, res: Response) {
  res.json({ items: await service.listBackedCampaigns(currentUserId(req)) });
}
