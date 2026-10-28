// AI assistance for campaign creation. Suggestions only: nothing is saved here, the app
// places the result into the editable draft and the creator can change or delete any of it.
// Without an OpenAI key (or if OpenAI fails) every function answers in a labelled demo mode.
import { extname } from "node:path";
import { unlink } from "node:fs/promises";
import { cloudinary, cloudinaryFolder, prebuildPreview } from "../../lib/cloudinary.js";
import { chatJson, generateImage as openAiImage, isOpenAiConfigured, transcribe as openAiTranscribe } from "../../lib/openai.js";
import { AppError } from "../../utils/app-error.js";
import { categoryEnum, creatorTypeEnum } from "../campaigns/campaigns.schema.js";
import { aiDraftSchema, type AiDraft, creativeFeedbackSchema } from "./ai.schema.js";

type Mode = "ai" | "demo";

async function withFallback<T>(live: () => Promise<T>, demo: () => T): Promise<{ mode: Mode; result: T }> {
  if (!isOpenAiConfigured()) return { mode: "demo", result: demo() };
  try {
    return { mode: "ai", result: await live() };
  } catch (err) {
    console.error("AI request failed, using demo mode:", err);
    return { mode: "demo", result: demo() };
  }
}

// ─── Voice → text ─────────────────────────────────────────────────────────────

const DEMO_TRANSCRIPT =
  "I want to tell parents in Austin that eleven of our thirty public schools tested high for lead in drinking water last spring. " +
  "The state already has money to replace the old pipes, but districts have to apply before March and most haven't. " +
  "I want to reach parents and school board voters aged 28 to 55 so they ask their district to apply.";

export async function transcribeRecording(file: { path: string; originalname: string; mimetype: string }) {
  try {
    if (!file.mimetype.startsWith("audio/") && file.mimetype !== "video/mp4") {
      throw AppError.badRequest("Upload an audio recording (m4a, mp3, wav or webm).");
    }
    const filename = `recording${extname(file.originalname) || ".m4a"}`;
    const { mode, result } = await withFallback(
      () => openAiTranscribe(file.path, filename, file.mimetype),
      () => DEMO_TRANSCRIPT,
    );
    if (!result) throw AppError.badRequest("We couldn't hear anything in that recording. Please try again.");
    const check = mode === "ai" ? await checkMeaningful(result) : { meaningful: true, reason: "" };
    return { mode, text: result, ...check };
  } finally {
    await unlink(file.path).catch(() => undefined);
  }
}

const MEANING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meaningful", "reason"],
  properties: {
    meaningful: { type: "boolean" },
    reason: { type: "string" },
  },
};

/**
 * Screens a transcript before it reaches the draft: is it a real description of a message or cause
 * (in any language), or noise, gibberish, a test phrase or unrelated chatter? Fails open, so a
 * flaky check never blocks the creator.
 */
async function checkMeaningful(text: string): Promise<{ meaningful: boolean; reason: string }> {
  try {
    return await chatJson<{ meaningful: boolean; reason: string }>(
      [
        {
          role: "system",
          content:
            "You screen voice transcripts for a campaign-creation app. The speaker should be describing a campaign: a message, " +
            "issue or cause they want more people to hear about. Decide if the transcript is a meaningful attempt at that. " +
            "Short or rough descriptions count as meaningful. Not meaningful: gibberish, random words, background noise, " +
            "'testing testing', counting, or talk unrelated to any message or cause. " +
            "If not meaningful, give a short, friendly reason addressed to the speaker (one sentence). Otherwise reason is empty.",
        },
        { role: "user", content: text.slice(0, 4000) },
      ],
      "transcript_check",
      MEANING_JSON_SCHEMA,
    );
  } catch (err) {
    console.error("Transcript check failed, allowing it:", err);
    return { meaningful: true, reason: "" };
  }
}

// ─── Text → campaign draft ────────────────────────────────────────────────────

const DRAFT_SYSTEM_PROMPT = `You help people prepare campaigns for a community-funded message-amplification platform.
Backers fund ADVERTISING that spreads the creator's message to new audiences; it is not a donation to the cause.

Turn the creator's description into a clear, calm, editorial draft. Rules:
- Use only facts the creator gave. Never invent statistics, numbers, names, quotes, studies, sources or links.
- Never set or suggest a funding goal.
- Plain, readable language. No hype, clickbait, fear-mongering or exclamation marks.
- title: at most 60 characters. adHeadline: at most 40 characters. adDescription: at most 125 characters. ctaText: 2-3 words.
- summary: 1-2 sentences. storyIntro: 2-3 sentences. storyBlocks: 2-5 blocks of headings and paragraphs that tell the story.
- targetAudience: who the message should reach, from what the creator said.
- creatorType: only if the creator made it clear, otherwise null. creatorDescription: one sentence, or null.
- followUpQuestions: 2-4 short questions about important missing information (for example evidence or sources to cite,
  the specific place, or what readers should do). Empty if nothing important is missing.`;

const nullable = (type: string) => ({ type: [type, "null"] });

const DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "category", "creatorType", "creatorDescription", "summary", "targetAudience", "whyItMatters",
    "storyHeadline", "storyIntro", "storyBlocks", "adHeadline", "adDescription", "ctaText", "followUpQuestions",
  ],
  properties: {
    title: { type: "string" },
    category: { type: "string", enum: categoryEnum.options },
    creatorType: { type: ["string", "null"], enum: [...creatorTypeEnum.options, null] },
    creatorDescription: nullable("string"),
    summary: { type: "string" },
    targetAudience: { type: "string" },
    whyItMatters: { type: "string" },
    storyHeadline: { type: "string" },
    storyIntro: { type: "string" },
    storyBlocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "text"],
        properties: { type: { type: "string", enum: ["heading", "paragraph"] }, text: { type: "string" } },
      },
    },
    adHeadline: { type: "string" },
    adDescription: { type: "string" },
    ctaText: { type: "string" },
    followUpQuestions: { type: "array", items: { type: "string" } },
  },
};

export async function draftCampaign(text: string) {
  const { mode, result } = await withFallback(
    async () =>
      aiDraftSchema.parse(
        await chatJson<AiDraft>(
          [
            { role: "system", content: DRAFT_SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
          "campaign_draft",
          DRAFT_JSON_SCHEMA,
        ),
      ),
    () => demoDraft(text),
  );
  return { mode, draft: fitLimits(result) };
}

/** Keeps AI output inside the same limits the form enforces. */
function fitLimits(d: AiDraft): AiDraft {
  const cut = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
  return {
    ...d,
    title: cut(d.title, 60),
    summary: cut(d.summary, 300),
    creatorDescription: d.creatorDescription && cut(d.creatorDescription, 300),
    targetAudience: cut(d.targetAudience, 300),
    whyItMatters: cut(d.whyItMatters, 1000),
    storyHeadline: cut(d.storyHeadline, 120),
    storyIntro: cut(d.storyIntro, 1000),
    storyBlocks: d.storyBlocks.slice(0, 10).map((b) => ({ ...b, text: cut(b.text, b.type === "heading" ? 120 : 5000) })),
    adHeadline: cut(d.adHeadline, 60),
    adDescription: cut(d.adDescription, 200),
    ctaText: cut(d.ctaText, 30),
    followUpQuestions: d.followUpQuestions.slice(0, 4),
  };
}

const CATEGORY_HINTS: [AiDraft["category"], RegExp][] = [
  ["health", /health|hospital|water|lead|disease|clinic|doctor/i],
  ["environment", /climate|tree|heat|pollution|air|river|waste|recycl/i],
  ["education", /school|student|teacher|library|education/i],
  ["science", /science|research|data|sensor|study/i],
  ["public_policy", /policy|council|law|bill|transit|bus|government/i],
  ["economic_policy", /tax|wage|price|economy|jobs|repair/i],
  ["arts_culture", /art|music|culture|theatre|museum/i],
  ["business", /business|shop|supplier|startup|market/i],
  ["community", /community|neighbour|neighbor|local|crossing|park/i],
];

/** Rule-based stand-in so the voice/AI flow can be demonstrated without an API key. */
function demoDraft(text: string): AiDraft {
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const first = sentences[0] ?? text;
  return {
    title: first.replace(/^(i want to|we want to|i'd like to)\s+/i, "").replace(/[.!?]$/, ""),
    category: CATEGORY_HINTS.find(([, re]) => re.test(text))?.[0] ?? "other",
    creatorType: null,
    creatorDescription: null,
    summary: sentences.slice(0, 2).join(" "),
    targetAudience: "People in the affected area who can act on this, and the decision-makers who can change it.",
    whyItMatters: sentences.slice(1, 3).join(" ") || first,
    storyHeadline: first.replace(/[.!?]$/, ""),
    storyIntro: sentences.slice(0, 2).join(" "),
    storyBlocks: [
      { type: "heading", text: "What is happening" },
      { type: "paragraph", text: sentences.join(" ") },
      { type: "heading", text: "Why it matters" },
      { type: "paragraph", text: "This campaign funds the reach to put the facts in front of the people who can act on them." },
    ],
    adHeadline: first.replace(/[.!?]$/, ""),
    adDescription: sentences.slice(1, 2).join(" ") || first,
    ctaText: "Learn more",
    followUpQuestions: [
      "Which sources back up the key facts? Add links so readers can check them.",
      "Which city or area should this reach?",
      "What should readers do after seeing the message?",
    ],
  };
}

// ─── Creative feedback on an ad ───────────────────────────────────────────────

const FEEDBACK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["strengths", "suggestions"],
  properties: {
    strengths: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "string" } },
  },
};

export async function creativeFeedback(input: {
  imageUrl: string;
  title?: string;
  adHeadline?: string;
  adDescription?: string;
  ctaText?: string;
}) {
  const adText = [
    input.title && `Campaign title: ${input.title}`,
    input.adHeadline && `Ad headline: ${input.adHeadline}`,
    input.adDescription && `Ad text: ${input.adDescription}`,
    input.ctaText && `Button: ${input.ctaText}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { mode, result } = await withFallback(
    async () =>
      creativeFeedbackSchema.parse(
        await chatJson(
          [
            {
              role: "system",
              content:
                "You review social media ad creatives for a civic message-amplification platform. Give honest, specific, " +
                "practical feedback on whether the image and text would make someone stop scrolling and read on, and whether " +
                "they are clear, credible and not misleading. 1-3 strengths and 2-4 suggestions, each one short sentence. " +
                "No scores or ratings.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: adText || "No ad text yet." },
                { type: "image_url", image_url: { url: input.imageUrl } },
              ],
            },
          ],
          "creative_feedback",
          FEEDBACK_JSON_SCHEMA,
        ),
      ),
    () => ({
      strengths: ["The image is the right shape for a feed ad."],
      suggestions: [
        "Make sure the main subject is clear even at a small size on a phone.",
        "Keep the headline short and specific; numbers people can check work well.",
        "Avoid text inside the image: ad platforms show it smaller than you expect.",
      ],
    }),
  );
  return { mode, ...result };
}

// ─── Image generation ─────────────────────────────────────────────────────────

// Keeps generated creatives honest and usable as ads: no fake people or brands, no baked-in text
const IMAGE_RULES =
  "Editorial, realistic photograph style with natural light and a calm, hopeful mood. " +
  "No text, captions, logos, watermarks or brand names in the image. " +
  "Do not depict real, identifiable people or public figures.";

/**
 * Generates a cover or ad image with AI and stores it like an upload, so the app can use the
 * returned asset exactly as if the creator had uploaded it. There is no demo fallback: without
 * AI the creator uploads an image instead.
 */
export async function generateCampaignImage(userId: string, body: { prompt: string; kind: "cover" | "ad" }) {
  if (!isOpenAiConfigured()) {
    throw new AppError(503, "AI_UNAVAILABLE", "AI images aren't available right now. Upload an image instead.");
  }
  let b64: string;
  try {
    b64 = await openAiImage(`${body.prompt}\n\n${IMAGE_RULES}`, body.kind === "cover" ? "1536x1024" : "1024x1024");
  } catch (err) {
    console.error("AI image generation failed:", err);
    throw new AppError(502, "AI_FAILED", "We couldn't create that image. Try a different description, or upload one.");
  }
  const result = await cloudinary.uploader.upload(`data:image/png;base64,${b64}`, {
    folder: cloudinaryFolder(`generated/${userId}`),
    resource_type: "image",
    format: "jpg", // ~5x smaller than the PNG OpenAI returns
    ...prebuildPreview,
  });
  return {
    url: result.secure_url,
    type: "image" as const,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    durationSec: null,
    aiGenerated: true,
  };
}
