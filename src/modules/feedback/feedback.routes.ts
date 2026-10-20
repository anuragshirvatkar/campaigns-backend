import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { idParams, validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./feedback.controller.js";
import { feedbackBody } from "./feedback.schema.js";

/** /campaigns/:id/feedback — "Did the visuals…?" / "Did this change your mind?" */
export const feedbackRouter = Router();

feedbackRouter.put(
  "/:id/feedback",
  requireAuth,
  validate({ params: idParams, body: feedbackBody }),
  controller.save,
);
