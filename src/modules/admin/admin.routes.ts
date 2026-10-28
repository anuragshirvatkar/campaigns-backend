import { Router } from "express";
import { requireAdmin } from "../../middlewares/auth.middleware.js";
import { idParams, validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./admin.controller.js";
import { adminCampaignsQuery, analyticsQuery, reviewBody } from "./admin.schema.js";

/** /admin — the platform admin only. */
export const adminRouter = Router();

adminRouter.use(requireAdmin);
adminRouter.get("/campaigns", validate({ query: adminCampaignsQuery }), controller.listCampaigns);
adminRouter.get("/campaigns/:id", validate({ params: idParams }), controller.getCampaign);
adminRouter.post("/campaigns/:id/review", validate({ params: idParams, body: reviewBody }), controller.reviewCampaign);
adminRouter.get("/analytics", validate({ query: analyticsQuery }), controller.analytics);
