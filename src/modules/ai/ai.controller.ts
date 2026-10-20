import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import { AppError } from "../../utils/app-error.js";
import * as service from "./ai.service.js";

export async function transcribe(req: Request, res: Response) {
  if (!req.file) throw AppError.badRequest('Attach the recording in the "file" field.');
  res.json(await service.transcribeRecording(req.file));
}

export async function draft(req: Request, res: Response) {
  res.json(await service.draftCampaign(req.body.text));
}

export async function creativeFeedback(req: Request, res: Response) {
  res.json(await service.creativeFeedback(req.body));
}

export async function image(req: Request, res: Response) {
  res.status(201).json(await service.generateCampaignImage(currentUserId(req), req.body));
}
