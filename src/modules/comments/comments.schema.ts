import { z } from "zod";
import { appConfig } from "../../config/app.config.js";

export const postCommentBody = z.object({
  body: z.string().trim().min(1, "Write a comment.").max(appConfig.comments.maxLength),
  parentId: z.uuid().optional(),
});

export const reportCommentBody = z.object({
  reason: z.enum(["spam", "abusive", "misleading", "other"]),
});
