import { tmpdir } from "node:os";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import * as controller from "./uploads.controller.js";
import { MAX_VIDEO_BYTES } from "./uploads.schema.js";

// Files go to a temp file on disk (not memory): the server has 512 MB of RAM and videos can be 50 MB
const upload = multer({ dest: tmpdir(), limits: { fileSize: MAX_VIDEO_BYTES, files: 1 } });

/** /uploads — multipart form: file + purpose (cover | ad | story | avatar). */
export const uploadsRouter = Router();

uploadsRouter.post("/", requireAuth, upload.single("file"), controller.upload);
