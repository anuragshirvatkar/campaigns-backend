import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { idParams, validate } from "../../middlewares/validate.middleware.js";
import { paginationQuery } from "../../utils/pagination.js";
import * as controller from "./notifications.controller.js";
import { pushTokenBody } from "./notifications.schema.js";

/** /me/notifications — the Activity tab. */
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get("/", validate({ query: paginationQuery }), controller.list);
// The tab badge polls this often, so it's a tiny query of its own
notificationsRouter.get("/unread-count", controller.unreadCount);
notificationsRouter.post("/read-all", controller.markAllRead);
// This device's Expo push token: saved after login, removed on logout
notificationsRouter.post("/push-token", validate({ body: pushTokenBody }), controller.savePushToken);
notificationsRouter.delete("/push-token", validate({ body: pushTokenBody }), controller.removePushToken);
notificationsRouter.post("/:id/read", validate({ params: idParams }), controller.markRead);
