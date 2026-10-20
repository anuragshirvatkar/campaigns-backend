import { z } from "zod";

const answer = z.enum(["no", "somewhat", "yes"]);

// The two questions appear at different points on the page, so either can be sent alone
export const feedbackBody = z
  .object({ visualsAnswer: answer, changedMindAnswer: answer })
  .partial()
  .refine((b) => b.visualsAnswer || b.changedMindAnswer, "Answer at least one question.");

export type FeedbackBody = z.infer<typeof feedbackBody>;
