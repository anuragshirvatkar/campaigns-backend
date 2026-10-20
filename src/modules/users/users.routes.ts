import { Router } from "express";
import { authLimiter } from "../../middlewares/rate-limit.middleware.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./users.controller.js";
import { preferencesSchema } from "../notifications/preferences.js";
import { changePasswordBody, updateMeBody } from "./users.schema.js";

/** /me — the logged-in user's account. */
export const usersRouter = Router();

usersRouter.get("/", requireAuth, controller.getMe);
usersRouter.patch("/", requireAuth, validate({ body: updateMeBody }), controller.updateMe);
usersRouter.get("/notification-preferences", requireAuth, controller.getNotificationPreferences);
usersRouter.put(
  "/notification-preferences",
  requireAuth,
  validate({ body: preferencesSchema }),
  controller.updateNotificationPreferences,
);
usersRouter.post(
  "/password",
  requireAuth,
  authLimiter,
  validate({ body: changePasswordBody }),
  controller.changePassword,
);
