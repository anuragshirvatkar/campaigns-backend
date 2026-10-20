import type { Request, Response } from "express";
import { currentUserId } from "../../middlewares/auth.middleware.js";
import * as preferences from "../notifications/preferences.js";
import * as usersService from "./users.service.js";

export async function getMe(req: Request, res: Response) {
  res.json(await usersService.getMe(currentUserId(req)));
}

export async function updateMe(req: Request, res: Response) {
  res.json(await usersService.updateMe(currentUserId(req), req.body));
}

export async function getNotificationPreferences(req: Request, res: Response) {
  res.json(await preferences.getPreferences(currentUserId(req)));
}

export async function updateNotificationPreferences(req: Request, res: Response) {
  res.json(await preferences.updatePreferences(currentUserId(req), req.body));
}

export async function changePassword(req: Request, res: Response) {
  await usersService.updatePassword(
    currentUserId(req),
    req.body.currentPassword,
    req.body.newPassword,
  );
  res.status(204).end();
}
