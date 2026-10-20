import type { RequestHandler } from "express";
import { z } from "zod";

type Schemas = {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
};

/**
 * Validates req.body / req.query / req.params against zod schemas.
 * Parsed body and params replace the originals; parsed query goes on res.locals.query
 * because Express 5 makes req.query read-only.
 * Failures throw a ZodError, which the error middleware turns into a 400.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
    if (schemas.query) res.locals.query = schemas.query.parse(req.query);
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    next();
  };
}

export const idParams = z.object({ id: z.uuid() });
