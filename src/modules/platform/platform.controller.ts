import type { Request, Response } from "express";
import { appConfig } from "../../config/app.config.js";
import { DEMO_CARDS } from "../../lib/dummy-payment.js";
import { isOpenAiConfigured } from "../../lib/openai.js";
import { reachPerDollar } from "../../utils/reach.js";

const CATEGORIES = [
  { value: "environment", label: "Environment" },
  { value: "health", label: "Health" },
  { value: "science", label: "Science" },
  { value: "education", label: "Education" },
  { value: "public_policy", label: "Public Policy" },
  { value: "economic_policy", label: "Economic Policy" },
  { value: "community", label: "Community" },
  { value: "arts_culture", label: "Arts & Culture" },
  { value: "business", label: "Business" },
  { value: "other", label: "Other" },
];

const CREATOR_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "influencer", label: "Creator / influencer" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "organization", label: "Organization" },
  { value: "business", label: "Business" },
  { value: "community_group", label: "Community group" },
];

// Guided questions for "Create with your voice"
const VOICE_PROMPTS = [
  "What is your campaign about?",
  "Who should this message reach?",
  "Why does it matter now?",
  "What evidence supports it?",
];

/** Everything the app needs to show the same rules and numbers as the server. */
export function getConfig(_req: Request, res: Response) {
  res.json({
    currency: appConfig.currency,
    fees: appConfig.fees,
    reach: {
      reachPerDollar: Math.round(reachPerDollar(null) * 10) / 10,
      ...appConfig.reach,
      disclaimer:
        "Estimates only, based on demo assumptions. Actual reach depends on ad inventory, prices, targeting, delivery and performance.",
    },
    funding: appConfig.funding,
    channels: appConfig.channels,
    categories: CATEGORIES,
    creatorTypes: CREATOR_TYPES,
    voicePrompts: VOICE_PROMPTS,
    lifecycle: appConfig.lifecycle,
    editableStatuses: appConfig.editableStatuses,
    comments: appConfig.comments,
    demo: {
      paymentsSimulated: true,
      testCards: DEMO_CARDS,
      reviewIsAutomatic: true,
      aiMode: isOpenAiConfigured() ? "ai" : "demo",
    },
  });
}
