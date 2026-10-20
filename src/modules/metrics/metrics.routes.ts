import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middlewares/auth.middleware.js";
import { idParams, validate } from "../../middlewares/validate.middleware.js";
import { idOrSlugParams } from "../campaigns/campaigns.schema.js";
import * as controller from "./metrics.controller.js";

/** /campaigns/:idOrSlug/report — public distribution report. */
export const reportRouter = Router();

reportRouter.get("/:idOrSlug/report", optionalAuth, validate({ params: idOrSlugParams }), controller.report);

/** /me/campaigns/:id/analytics — the creator's dashboard numbers. */
export const analyticsRouter = Router();

analyticsRouter.get("/:id/analytics", requireAuth, validate({ params: idParams }), controller.analytics);
