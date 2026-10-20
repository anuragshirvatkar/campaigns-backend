// Campaign review: every submitted campaign is checked against the platform's rules before it can
// go live. A language model answers a few narrow questions about the content (is it eligible at
// all, is the message understandable, is anything clearly deceptive); objective checks such as
// "every statistic cites a source" run in code; the decision is then made here, predictably:
//   not eligible → rejected · anything to fix → changes requested · otherwise → approved.
// Without the model, built-in rules answer the same questions, so a campaign is never stuck.
import type { Campaign } from "@prisma/client";
import { chatJson, isOpenAiConfigured } from "../../lib/openai.js";
import type { AdAsset, Reach, Source, StoryBlock } from "./campaigns.schema.js";

export type ReviewIssue = { field: string; step: number; message: string };
export type ReviewResult = {
  decision: "approved" | "changes_requested" | "rejected";
  summary: string;
  issues: ReviewIssue[];
  reviewer: "ai" | "rules";
};

/** What the content check reports; the decision is derived from it below. */
type ContentCheck = {
  eligible: boolean;
  ineligibleReason: string;
  understandable: boolean;
  deceptive: string[];
};

const POLICY = `You screen campaigns for a community-funded message-amplification platform. Backers pay for ADVERTISING
that spreads a creator's message (a public issue, cause, idea, community or cultural story, or a local business
message) to new audiences. It is not a donation or personal fundraising platform.

Answer three questions about the campaign:

1. eligible: false ONLY if the campaign is not an eligible message at all: gibberish, placeholder or test content;
   a personal wish or purchase (e.g. "I want a PlayStation", "buy me a phone"); personal fundraising for one
   person's purchases, bills or travel; a scam, get-rich-quick or misleading financial offer; hate, harassment or
   discrimination; violence or illegal activity; adult content; an ad for or against a political candidate or
   party (issue campaigns are fine); medical claims against established health guidance. Otherwise true.
   ineligibleReason: one friendly sentence to the creator when eligible is false, else "".

2. understandable: true if an ordinary reader can tell what the campaign is about and what it asks for. Short
   campaigns are fine. False only if the message is genuinely unclear.

3. deceptive: a list (usually empty) of statements that are clearly false, fabricated or deliberately misleading,
   each as one short sentence to the creator. Do NOT list: claims you merely can't verify, first-hand observations
   ("our survey found", "we counted"), opinions, or writing that could be more persuasive. You cannot open links.`;

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["eligible", "ineligibleReason", "understandable", "deceptive"],
  properties: {
    eligible: { type: "boolean" },
    ineligibleReason: { type: "string" },
    understandable: { type: "boolean" },
    deceptive: { type: "array", items: { type: "string" } },
  },
};

const storyText = (blocks: StoryBlock[]) => blocks.map((b) => ("text" in b ? b.text : "")).join(" ");

/** Plain-text view of what the reviewer needs to judge (no internal ids). */
function describe(c: Campaign) {
  const blocks = (c.storyBlocks ?? []) as StoryBlock[];
  const sources = (c.sources ?? []) as Source[];
  const reach = (c.reach ?? {}) as Partial<Reach>;
  const story = blocks
    .map((b) =>
      b.type === "heading" || b.type === "paragraph"
        ? b.text
        : b.type === "stat"
          ? `[Statistic] ${b.value}: ${b.label}${b.sourceId ? " (cites a source)" : ""}`
          : b.type === "image"
            ? `[Image]${b.caption ? ` ${b.caption}` : ""}`
            : `[Call to action] ${b.label}`,
    )
    .join("\n");
  return [
    `Title: ${c.title ?? ""}`,
    `Category: ${c.category ?? ""}`,
    `Creator: ${c.creatorName ?? ""} (${c.creatorType ?? "unspecified"})`,
    `Summary: ${c.summary ?? ""}`,
    `Why it matters: ${c.whyItMatters ?? ""}`,
    `Story intro: ${c.storyIntro ?? ""}`,
    `Story:\n${story}`,
    `Sources: ${sources.map((s) => s.title).join("; ") || "(none)"}`,
    `Ad text: ${[c.adHeadline, c.adDescription].filter(Boolean).join(" — ")}`,
    `Locations: ${(reach.locations ?? []).join(", ")}`,
  ].join("\n");
}

async function checkWithAi(c: Campaign): Promise<ContentCheck> {
  return chatJson<ContentCheck>(
    [
      { role: "system", content: POLICY },
      { role: "user", content: describe(c).slice(0, 12_000) },
    ],
    "campaign_check",
    CHECK_SCHEMA,
  );
}

export async function reviewCampaign(c: Campaign): Promise<ReviewResult> {
  let check: ContentCheck;
  let reviewer: ReviewResult["reviewer"] = "ai";
  try {
    if (!isOpenAiConfigured()) throw new Error("no AI");
    check = await checkWithAi(c);
  } catch (err) {
    if (isOpenAiConfigured()) console.error("AI review failed, using the built-in rules:", err);
    check = checkByRules(c);
    reviewer = "rules";
  }
  return decide(c, check, reviewer);
}

/** The decision, from the content check plus objective checks that need no judgement. */
function decide(c: Campaign, check: ContentCheck, reviewer: ReviewResult["reviewer"]): ReviewResult {
  if (!check.eligible) {
    return {
      decision: "rejected",
      summary: "This campaign can't run on the platform.",
      issues: [{ field: "title", step: 1, message: check.ineligibleReason || "It isn't an eligible message under the campaign rules." }],
      reviewer,
    };
  }

  const issues: ReviewIssue[] = [];
  const blocks = (c.storyBlocks ?? []) as StoryBlock[];
  const sourceIds = new Set(((c.sources ?? []) as Source[]).map((s) => s.id));
  for (const b of blocks) {
    if (b.type === "stat" && (!b.sourceId || !sourceIds.has(b.sourceId))) {
      issues.push({ field: "storyBlocks", step: 2, message: `Link the statistic "${b.value}" to a source so readers can check it.` });
    }
  }
  if (!check.understandable) {
    issues.push({ field: "storyBlocks", step: 2, message: "Explain the issue and what you're asking for in a few clear sentences." });
  }
  for (const d of check.deceptive.slice(0, 3)) issues.push({ field: "storyBlocks", step: 2, message: d });

  return issues.length
    ? { decision: "changes_requested", summary: "Your campaign is nearly ready. Fix the points below and resubmit.", issues: issues.slice(0, 5), reviewer }
    : { decision: "approved", summary: "Your campaign meets the content and advertising rules.", issues: [], reviewer };
}

// ─── Built-in rules (when the model is unavailable) ───────────────────────────

const BANNED = /\b(vote (for|against)|re-?elect|scam|crypto ?giveaway|get rich|guaranteed returns|xxx)\b/i;
const WANTS = /\b(i|we) (really )?(want|need|wish|would like)( to (buy|get|have))? (a|an|my|new)\b|\b(buy|get) me\b/i;

/** Rough "is this real writing?" check: enough words, mostly real-looking ones. */
function looksLikeWriting(text: string) {
  const words = text.toLowerCase().match(/[a-zÀ-ɏऀ-ॿ]+/g) ?? [];
  if (words.length < 12) return false;
  const real = words.filter((w) => /[aeiouyऀ-ॿ]/.test(w) && !/(.)\1{3,}/.test(w));
  return real.length / words.length > 0.7 && new Set(words).size / words.length > 0.35;
}

function checkByRules(c: Campaign): ContentCheck {
  const blocks = (c.storyBlocks ?? []) as StoryBlock[];
  const text = [c.title, c.summary, c.storyIntro, storyText(blocks)].join(" ");
  const no = (reason: string): ContentCheck => ({ eligible: false, ineligibleReason: reason, understandable: true, deceptive: [] });
  if (BANNED.test(text)) return no("It looks like a political candidate ad or a financial offer, which the rules don't allow.");
  if (WANTS.test(text)) return no("It reads like a personal wish or purchase. Campaigns need a message or cause that matters to other people.");
  if (!looksLikeWriting(text)) return no("We couldn't find a clear message. It reads like placeholder or test text.");
  return { eligible: true, ineligibleReason: "", understandable: storyText(blocks).split(/\s+/).filter(Boolean).length >= 25, deceptive: [] };
}
