import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middlewares/auth.middleware.js";
import { idParams, validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./comments.controller.js";
import { postCommentBody, reportCommentBody } from "./comments.schema.js";

/** /campaigns/:id/comments — reading is public, posting needs an account. */
export const campaignCommentsRouter = Router();

campaignCommentsRouter.get("/:id/comments", optionalAuth, validate({ params: idParams }), controller.list);
campaignCommentsRouter.post(
  "/:id/comments",
  requireAuth,
  validate({ params: idParams, body: postCommentBody }),
  controller.post,
);

/** /comments/:id */
export const commentsRouter = Router();

commentsRouter.use(requireAuth);
commentsRouter.delete("/:id", validate({ params: idParams }), controller.remove);
commentsRouter.post("/:id/report", validate({ params: idParams, body: reportCommentBody }), controller.report);
