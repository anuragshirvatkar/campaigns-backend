import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { currentUserId, requireAuth } from "../../middlewares/auth.middleware.js";
import { assistantLimiter } from "../../middlewares/rate-limit.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { getClip } from "../../lib/speech.js";
import { AppError } from "../../utils/app-error.js";
import { speakBody, turnBody } from "./assistant.schema.js";
import { audioUrl, runTurn } from "./assistant.service.js";

const speech = multer({ dest: tmpdir(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

/** /assistant — Sam, the voice assistant. */
export const assistantRouter = Router();

// Audio clips are fetched by the app's audio player, which can't send headers: the id is the secret
assistantRouter.get("/audio/:id", (req: Request, res: Response) => {
  const audio = getClip(String(req.params.id));
  if (!audio) throw AppError.notFound("This clip has expired.");
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "private, max-age=600");
  res.send(audio);
});

assistantRouter.use(requireAuth, assistantLimiter);

/** A voice (multipart "file" + "context" JSON) or typed ({ text, context }) request → reply, actions, audio. */
assistantRouter.post("/turn", speech.single("file"), async (req: Request, res: Response) => {
  const started = Date.now();
  try {
    // Multipart sends the context as a JSON string field
    const raw = req.file ? { context: JSON.parse(String(req.body.context ?? "{}")), text: undefined } : req.body;
    const body = turnBody.parse(raw);
    if (!req.file && !body.text) throw AppError.badRequest("Send a recording or some text.");
    res.json(await runTurn(currentUserId(req), { text: body.text, audio: req.file }, body.context));
  } catch (err) {
    // Every failed turn leaves a trace, including the ones that aren't server errors
    console.warn(`[sam] turn failed after ${Date.now() - started} ms (${req.file ? "voice" : "text"}):`, err instanceof Error ? err.message : err);
    throw err;
  } finally {
    if (req.file) await rm(req.file.path, { force: true }).catch(() => {});
  }
});

/** Speaks a fixed line (the intro tour). */
assistantRouter.post("/speak", validate({ body: speakBody }), async (req: Request, res: Response) => {
  res.json({ audioUrl: await audioUrl(req.body.text) });
});
