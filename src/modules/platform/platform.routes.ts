import { Router } from "express";
import * as controller from "./platform.controller.js";

/** /config — public app settings. */
export const platformRouter = Router();

platformRouter.get("/", controller.getConfig);
