import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { idParams, validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./updates.controller.js";
import { postUpdateBody } from "./updates.schema.js";

/** /campaigns/:id/updates — the creator posts, everyone reads. */
export const updatesRouter = Router();

updatesRouter.get("/:id/updates", validate({ params: idParams }), controller.list);
updatesRouter.post(
  "/:id/updates",
  requireAuth,
  validate({ params: idParams, body: postUpdateBody }),
  controller.post,
);
