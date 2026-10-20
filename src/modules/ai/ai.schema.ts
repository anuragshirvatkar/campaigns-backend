import { z } from "zod";
import { categoryEnum, creatorTypeEnum } from "../campaigns/campaigns.schema.js";

export const draftBody = z.object({
  // A voice transcript or a typed description of the idea
  text: z.string().trim().min(20, "Tell us a little more about your idea (at least a sentence or two).").max(8000),
});

export const creativeFeedbackBody = z.object({
  imageUrl: z.url({ protocol: /^https$/ }),
  title: z.string().max(60).optional(),
  adHeadline: z.string().max(60).optional(),
  adDescription: z.string().max(200).optional(),
  ctaText: z.string().max(30).optional(),
});

// What the AI is allowed to fill in. Sources and the funding goal are deliberately absent:
// sources must come from the creator, and the goal is set only by the creator in Step 5.
export const aiDraftSchema = z.object({
  title: z.string(),
  category: categoryEnum,
  creatorType: creatorTypeEnum.nullable(),
  creatorDescription: z.string().nullable(),
  summary: z.string(),
  targetAudience: z.string(),
  whyItMatters: z.string(),
  storyHeadline: z.string(),
  storyIntro: z.string(),
  storyBlocks: z.array(z.object({ type: z.enum(["heading", "paragraph"]), text: z.string() })),
  adHeadline: z.string(),
  adDescription: z.string(),
  ctaText: z.string(),
  followUpQuestions: z.array(z.string()),
});

export type AiDraft = z.infer<typeof aiDraftSchema>;

export const creativeFeedbackSchema = z.object({
  strengths: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export const imageBody = z.object({
  // What the picture should show; the app pre-fills it from the campaign title and summary
  prompt: z.string().trim().min(10, "Describe the image in a sentence or two.").max(1000),
  // cover = landscape campaign cover, ad = square ad creative
  kind: z.enum(["cover", "ad"]),
});
