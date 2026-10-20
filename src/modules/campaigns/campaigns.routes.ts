import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middlewares/auth.middleware.js";
import { idParams, validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./campaigns.controller.js";
import {
  createCampaignBody,
  idOrSlugParams,
  listCampaignsQuery,
  myCampaignsQuery,
  updateCampaignBody,
} from "./campaigns.schema.js";

/** /campaigns — browsing works without an account. */
export const campaignsRouter = Router();

campaignsRouter.get("/", validate({ query: listCampaignsQuery }), controller.list);
campaignsRouter.get("/:idOrSlug", optionalAuth, validate({ params: idOrSlugParams }), controller.detail);

/** /me/campaigns — the creator's own campaigns. */
export const myCampaignsRouter = Router();

myCampaignsRouter.use(requireAuth);
myCampaignsRouter.post("/", validate({ body: createCampaignBody }), controller.createDraft);
myCampaignsRouter.get("/", validate({ query: myCampaignsQuery }), controller.listMine);
myCampaignsRouter.get("/:id", validate({ params: idParams }), controller.getMine);
myCampaignsRouter.patch("/:id", validate({ params: idParams, body: updateCampaignBody }), controller.updateMine);
myCampaignsRouter.delete("/:id", validate({ params: idParams }), controller.deleteMine);
myCampaignsRouter.post("/:id/submit", validate({ params: idParams }), controller.submitMine);
myCampaignsRouter.post("/:id/cancel", validate({ params: idParams }), controller.cancelMine);
