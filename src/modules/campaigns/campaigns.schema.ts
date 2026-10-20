import { z } from "zod";
import { appConfig, PUBLIC_STATUSES } from "../../config/app.config.js";

const { funding, channels } = appConfig;

const httpUrl = z.url({ protocol: /^https?$/, message: "Use a full link starting with https://" });
const localId = z.string().trim().min(1).max(40);

// ─── JSON column shapes ───────────────────────────────────────────────────────

export const storyBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), id: localId.optional(), text: z.string().max(120) }),
  // Paragraph text supports simple Markdown (**bold**, *italic*, - lists)
  z.object({ type: z.literal("paragraph"), id: localId.optional(), text: z.string().max(5000) }),
  z.object({
    type: z.literal("image"),
    id: localId.optional(),
    url: httpUrl,
    caption: z.string().max(200).optional(),
    credit: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("stat"),
    id: localId.optional(),
    value: z.string().max(40),
    label: z.string().max(160),
    sourceId: localId.optional(), // points to sources[].id
  }),
  z.object({
    type: z.literal("action"),
    id: localId.optional(),
    label: z.string().max(80),
    url: httpUrl.optional(),
  }),
]);

export const sourceSchema = z.object({
  id: localId,
  title: z.string().trim().min(1, "Give the source a title.").max(200),
  url: httpUrl,
});

export const adAssetSchema = z.object({
  id: localId,
  type: z.enum(["image", "video"]),
  url: httpUrl,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().positive().optional(),
  // Created with the AI image tool; shown with an "AI-generated" label
  aiGenerated: z.boolean().optional(),
});

const channelSchema = z.enum(channels);

export const reachSchema = z.object({
  locations: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  ageMin: z.number().int().min(13).max(100).nullish(),
  ageMax: z.number().int().min(13).max(100).nullish(),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  channels: z.array(channelSchema).max(channels.length).default([]),
  // Percent of the ad budget per channel, e.g. { facebook: 60, instagram: 40 }
  budgetSplit: z.partialRecord(channelSchema, z.number().int().min(0).max(100)).default({}),
});

export type StoryBlock = z.infer<typeof storyBlockSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type AdAsset = z.infer<typeof adAssetSchema>;
export type Reach = z.infer<typeof reachSchema>;

// ─── Request bodies ───────────────────────────────────────────────────────────

export const categoryEnum = z.enum([
  "environment",
  "health",
  "science",
  "education",
  "public_policy",
  "economic_policy",
  "community",
  "arts_culture",
  "business",
  "other",
]);

export const creatorTypeEnum = z.enum([
  "individual",
  "influencer",
  "nonprofit",
  "organization",
  "business",
  "community_group",
]);

const nullableText = (max: number) => z.string().trim().max(max).nullable();

/** Autosave: every field optional, drafts may be incomplete but must be well-formed. */
export const updateCampaignBody = z
  .object({
    currentStep: z.number().int().min(1).max(5),
    creationMode: z.enum(["manual", "voice"]),

    title: z.string().trim().max(60, "Keep the title to 60 characters.").nullable(),
    category: categoryEnum.nullable(),
    creatorName: nullableText(80),
    creatorType: creatorTypeEnum.nullable(),
    creatorDescription: nullableText(300),
    summary: nullableText(300),
    coverImageUrl: httpUrl.nullable(),
    targetAudience: nullableText(300),
    whyItMatters: nullableText(1000),

    storyHeadline: nullableText(120),
    storyIntro: nullableText(1000),
    storyBlocks: z.array(storyBlockSchema).max(60),
    sources: z.array(sourceSchema).max(30),

    adHeadline: nullableText(60),
    adDescription: nullableText(200),
    ctaText: nullableText(30),
    adAssets: z.array(adAssetSchema).max(10),

    reach: reachSchema,
    durationDays: z
      .number()
      .int()
      .refine((d) => (funding.durationDays as readonly number[]).includes(d), {
        message: `Choose ${funding.durationDays.join(", ")} days.`,
      }),

    fundingGoalCents: z.number().int().min(funding.minGoalCents).max(funding.maxGoalCents).nullable(),
    rulesAccepted: z.boolean(),
  })
  .partial();

export type UpdateCampaignBody = z.infer<typeof updateCampaignBody>;

export const createCampaignBody = z.object({
  creationMode: z.enum(["manual", "voice"]).default("manual"),
});

// ─── Query strings ────────────────────────────────────────────────────────────

export const listCampaignsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: categoryEnum.optional(),
  status: z.enum(PUBLIC_STATUSES).optional(),
  featured: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  sort: z.enum(["newest", "most_funded", "ending_soon", "nearly_funded"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const myCampaignsQuery = z.object({
  tab: z
    .enum(["drafts", "under_review", "funding", "promoting", "completed", "requires_action"])
    .optional(),
});

export const idOrSlugParams = z.object({ idOrSlug: z.string().min(1).max(80) });
