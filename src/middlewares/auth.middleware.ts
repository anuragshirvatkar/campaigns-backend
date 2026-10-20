import type { Request, RequestHandler } from "express";
import { verifyToken } from "../lib/jwt.js";
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
