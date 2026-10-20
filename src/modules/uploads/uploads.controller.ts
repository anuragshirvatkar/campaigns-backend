import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import { AppError } from "../../utils/app-error.js";
import * as service from "./uploads.service.js";

export async function upload(req: Request, res: Response) {
  if (!req.file) throw AppError.badRequest('Attach a file in the "file" field.');
  // The body (purpose) is validated inside the service so the temp file is cleaned up on failure
  res.status(201).json(await service.uploadFile(currentUserId(req), req.body, req.file));
}
