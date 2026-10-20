import { tmpdir } from "node:os";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { aiImageLimiter, aiLimiter } from "../../middlewares/rate-limit.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./ai.controller.js";
import { creativeFeedbackBody, draftBody, imageBody } from "./ai.schema.js";

const recording = multer({ dest: tmpdir(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

/** /ai — creation assistance. Requires login and is rate limited because each call costs money. */
export const aiRouter = Router();

aiRouter.use(requireAuth, aiLimiter);
aiRouter.post("/transcribe", recording.single("file"), controller.transcribe);
aiRouter.post("/draft", validate({ body: draftBody }), controller.draft);
aiRouter.post("/creative-feedback", validate({ body: creativeFeedbackBody }), controller.creativeFeedback);
aiRouter.post("/image", aiImageLimiter, validate({ body: imageBody }), controller.image);
