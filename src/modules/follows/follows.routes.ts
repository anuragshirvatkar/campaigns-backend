import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { idParams, validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./follows.controller.js";

/** /campaigns/:id/follow — PUT and DELETE are safe to repeat. */
export const followsRouter = Router();

followsRouter.put("/:id/follow", requireAuth, validate({ params: idParams }), controller.follow);
followsRouter.delete("/:id/follow", requireAuth, validate({ params: idParams }), controller.unfollow);

/** /me/follows */
export const myFollowsRouter = Router();

myFollowsRouter.get("/follows", requireAuth, controller.listMine);
