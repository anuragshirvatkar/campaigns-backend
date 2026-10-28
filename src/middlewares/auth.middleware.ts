import type { Request, RequestHandler } from "express";
import { verifyToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/app-error.js";

function userIdFrom(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return verifyToken(header.slice("Bearer ".length));
}

/** Rejects the request with 401 unless a valid token is sent. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const userId = userIdFrom(req);
  if (!userId) throw AppError.unauthorized();
  req.userId = userId;
  next();
};

/** requireAuth, plus the account must be the platform admin. */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  const userId = userIdFrom(req);
  if (!userId) throw AppError.unauthorized();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) throw AppError.unauthorized();
  if (user.role !== "admin") throw AppError.forbidden("Only the admin can do this.");
  req.userId = userId;
  next();
};

/** Sets req.userId when a valid token is sent; anonymous requests continue. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  req.userId = userIdFrom(req) ?? undefined;
  next();
};

/** For handlers behind requireAuth. */
export function currentUserId(req: Request) {
  if (!req.userId) throw AppError.unauthorized();
  return req.userId;
}
