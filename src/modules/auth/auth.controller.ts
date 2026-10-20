import type { Request, Response } from "express";
import * as authService from "./auth.service.js";

export async function signup(req: Request, res: Response) {
  res.status(201).json(await authService.signup(req.body));
}

export async function forgotPassword(req: Request, res: Response) {
  await authService.forgotPassword(req.body);
  // Same reply either way, so this can't be used to find out which emails have accounts
  res.json({ message: "If that email has an account, we've sent it a code." });
}

export async function resetPassword(req: Request, res: Response) {
  res.json(await authService.resetPassword(req.body));
}

export async function google(req: Request, res: Response) {
  res.json(await authService.google(req.body));
}

export async function login(req: Request, res: Response) {
  res.json(await authService.login(req.body));
}
