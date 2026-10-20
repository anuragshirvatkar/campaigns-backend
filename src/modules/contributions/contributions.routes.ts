import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middlewares/auth.middleware.js";
import { idParams, validate } from "../../middlewares/validate.middleware.js";
import { paginationQuery } from "../../utils/pagination.js";
import * as controller from "./contributions.controller.js";
import { confirmContributionBody, createContributionBody } from "./contributions.schema.js";

/**
 * /contributions — checkout, signed in or as a guest (no account needed). A guest's create call
 * returns a guestToken that the app sends back as the X-Guest-Token header on the other calls.
 */
export const contributionsRouter = Router();

contributionsRouter.use(optionalAuth);
contributionsRouter.post("/", validate({ body: createContributionBody }), controller.create);
contributionsRouter.get("/:id", validate({ params: idParams }), controller.get);
contributionsRouter.post(
  "/:id/confirm",
  validate({ params: idParams, body: confirmContributionBody }),
  controller.confirm,
);
contributionsRouter.post("/:id/cancel", validate({ params: idParams }), controller.cancel);

/** /me/contributions and /me/backed — payment history and backed campaigns. */
export const myContributionsRouter = Router();

myContributionsRouter.use(requireAuth);
myContributionsRouter.get("/contributions", validate({ query: paginationQuery }), controller.listMine);
myContributionsRouter.get("/backed", controller.listBacked);
