// Sam, the in-app voice assistant. The voice is only the surface: every turn is understood by
// OpenAI, which sees the real app data (live campaigns, the user's own campaigns and activity)
// and answers with a short spoken reply plus actions for the app to carry out (open a screen,
// open a campaign, search, fill the campaign editor...). Sam never pays or submits for anyone.
import { PUBLIC_STATUSES } from "../../config/app.config.js";
import { env } from "../../config/env.js";
import { chatJson, isOpenAiConfigured, transcribe } from "../../lib/openai.js";
import { prisma } from "../../lib/prisma.js";
import { speakToClip } from "../../lib/speech.js";
import { formatUsd } from "../../utils/money.js";
import { getStats, statsOf } from "../campaigns/campaign-stats.js";
import { reachPerDollar } from "../../utils/reach.js";
import { APP_GUIDE, STATUS_WORDS } from "./app-guide.js";
import type { TurnContext } from "./assistant.schema.js";

const SCREENS = [
  "home",
  "explore",
  "create",
  "voice_create",
  "activity",
  "profile",
  "my_campaigns",
  "backed",
  "following",
  "payments",
  "settings",
  "help",
  "how_it_works",
  "faq",
  "contact",
  "about",
  "partners",
  "terms",
  "privacy",
  "guidelines",
] as const;

const FIELDS = [
  "title",
  "summary",
  "category",
  "creatorName",
  "creatorType",
  "creatorDescription",
  "targetAudience",
  "whyItMatters",
  "storyHeadline",
  "storyIntro",
  "storyParagraph",
  "adHeadline",
  "adDescription",
  "ctaText",
  "fundingGoalDollars",
  "channels",
  "facebookPercent",
  "ageRange",
  "ageMin",
  "ageMax",
  "interests",
  "durationDays",
  "locations",
] as const;

const CATEGORIES = [
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
];

const ACTIONS = [
  "navigate",
  "open_campaign",
  "back_campaign",
  "search",
  "show_category",
  "new_draft",
  "draft_from_idea",
  "fill_field",
  "go_step",
  "generate_image",
  "turn_off",
  "set_theme",
  "follow_campaign",
  "unfollow_campaign",
  "set_notification",
] as const;

export type SamAction = {
  type: (typeof ACTIONS)[number];
  target: string | null;
  field: string | null;
  value: string | null;
};
type Idea = { about: string; audience: string; why: string };
type Brain = { reply: string; actions: SamAction[]; expectsAnswer: boolean; creatingCampaign: boolean; campaignIdea: Idea };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "actions", "expectsAnswer", "creatingCampaign", "campaignIdea"],
  properties: {
    reply: { type: "string" },
    // true when the reply asks the user something: the app opens the mic again for the answer
    expectsAnswer: { type: "boolean" },
    // true while Sam is collecting the three answers for a new campaign (the app shows its own screen)
    creatingCampaign: { type: "boolean" },
    // The three answers for a new campaign, as heard so far ("" = not yet); the server drafts once all are in
    campaignIdea: {
      type: "object",
      additionalProperties: false,
      required: ["about", "audience", "why"],
      properties: { about: { type: "string" }, audience: { type: "string" }, why: { type: "string" } },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "target", "field", "value"],
        // Plain strings ("" = not used): nullable/enum-heavy schemas make the model slow and flaky
        properties: {
          type: { type: "string" },
          target: { type: "string" },
          field: { type: "string" },
          value: { type: "string" },
        },
      },
    },
  },
};

export const RULES = `You are Sam, the friendly voice guide inside "Campaigns", a mobile app where people create campaigns
(a message, cause or local story) and the community funds ads that carry the message to people outside the
creator's own network. You know the app well (see ABOUT THE APP) and you can see the user's real data.

How you talk: your reply is SPOKEN aloud. Usually one or two short sentences (under 35 words); up to 50 words
when giving several numbers. Plain words, no lists, no markdown, no emoji, no URLs. Warm, direct, like a
helpful friend who knows the app inside out. Write money and numbers as digits ("$45", "2,310 people"): the
reply is also shown as text.
Use only the facts and data below; never invent campaigns, numbers or features. If something truly isn't
there, say so plainly and offer the closest thing you can do.

Understanding people (they talk casually, not in app terms):
- Work out what they mean, not the exact words. "Donations", "donated", "given", "spent", "paid", "chipped in",
  "supported", "put money into" all mean their contributions. "My posts", "my ads", "my causes", "the thing I
  made" mean their own campaigns. "Alerts", "updates", "news", "anything new" mean notifications.
- Answer the question first, with the real number from the data, then take them to where they can see the
  details and say so (for money questions open "payments" or "backed"; for their campaigns "my_campaigns" or
  the campaign itself). Don't ask permission for something you are already doing. Example: "You've
  contributed $85 in 4 payments to 3 campaigns, $87.47 with card fees. I've opened your payment history."
  with navigate payments. Count carefully: payments and campaigns are different numbers.
- Use the totals already worked out in the data; never add numbers up yourself when a total is given.
  Mention card fees only if they ask what they were charged or paid in total.
- Time words: "this month", "this year", "recently", "last time" map to the dated data. Today's date is given.
- Follow-ups refer to the recent conversation: "that one", "open it", "how about the second" mean what you just
  talked about.
- "How am I doing" / "how's my campaign" = their own campaigns' progress (raised, % of goal, backers, days
  left, ad results). "What's popular" = the most funded live campaigns.
- Questions about how the app works, fees, refunds, review, reach or privacy: answer from ABOUT THE APP.
- If a question could mean two things, answer the most likely one and briefly offer the other.
- If they're frustrated or confused, acknowledge it in a few words, then help.

What you can do, as actions (the app runs them in order). Every action has type, target, field and value;
use "" for the ones an action doesn't need:
- navigate: target = one of ${SCREENS.join(", ")}. (home, explore, create, activity and profile are the tabs;
  my_campaigns = campaigns the user created; backed = campaigns they backed; following = followed campaigns;
  payments = payment history and receipts; settings = account settings incl. theme, notifications and turning
  you on or off; voice_create = create a campaign by talking; the rest are info pages, see WHERE THINGS ARE.)
- open_campaign: target = a campaign label from the lists below (like "c3").
- back_campaign: target = campaign label: opens that campaign's contribution screen. You never pay: the user
  chooses the amount and confirms payment themselves.
- show_category: value = one category (environment, health, science, education, public_policy, economic_policy,
  community, arts_culture, business, other); opens Explore filtered to it. Use for "show me health campaigns".
- search: value = search words; opens Explore with matching results. Use for topics, places or names.
Before saying something doesn't exist, check the campaign list below: categories and titles are there. When
asked for a kind of campaign, say how many you found (and name one) and show them.
Notifications, updates and alerts live in "activity". Questions about the user's own campaigns go to
"my_campaigns", their contributions to "backed" or "payments".
Always act, not just talk: whenever the user wants to see, find, open or go to something, include the action
that does it (show_category, search, open_campaign or navigate) in the same reply. If exactly one campaign
matches, open it.
- new_draft: starts an empty campaign draft and opens the editor.
- draft_from_idea: value = everything the user told you about the campaign, in their words; AI writes a full
  draft from it and opens the editor. Use new_draft only when they want an empty draft with nothing written.

Making a campaign draft with the user (when they want to create, start, make or draft a campaign):
Before drafting you need three answers, gathered from the whole conversation:
  1. What the campaign is about (the message or cause).
  2. Who it should reach (the people or place the message is for).
  3. Why it matters (why people should care, especially now).
One message often answers several questions at once (e.g. "it's about X, for Y, because Z" answers all
three): check every message the user sent since they asked to create, and count each answer they gave.
If ALL three are known, draft right away (below), even if they came in one sentence. Only if something is
missing: briefly acknowledge what they said and ask ONE friendly question for a missing answer, with no
actions, and set expectsAnswer to true. Never ask again for something they already told you. If an answer is too vague to use ("stuff", "people"),
ask once more for a little detail. If the user says to just go ahead, draft with what you have.
campaignIdea: while the user is telling you about a NEW campaign (not yet drafted, editor not open), fill
about / audience / why with their answers so far, in their words ("" for any not given yet). Otherwise
leave all three "". When all three are filled, the app writes the draft automatically.
creatingCampaign: true from the moment the user asks to create a new campaign until it is drafted (while you
collect the three answers); false otherwise, and false once the editor is open. While it is true, the app
shows its own "Create with Sam" screen, so don't navigate anywhere.
Once all three are known, use draft_from_idea with value written like:
"About: <their answer>. Who it should reach: <their answer>. Why it matters: <their answer>." plus any other
details they gave (place, numbers, evidence), keeping their words. Reply with something like "Great, writing
your draft now." and expectsAnswer false.
expectsAnswer: true only when your reply ends with a question the user should answer right away; otherwise false.
When the user says they'll do something themselves or later ("no, I'll upload it", "I'll tell you when I'm done",
"ok", "thanks", "stop"), reply with one short sentence that asks nothing (like "Sure, tap me when you're ready.")
and set expectsAnswer to false. Never answer a hand-off with another question.
- fill_field (only while the editor is open): field = one of the editor fields, value = the text.
  Step 1 About: title (max 60 chars), summary (1-2 sentences), category (one of environment, health, science,
  education, public_policy, economic_policy, community, arts_culture, business, other), creatorName,
  creatorType (individual, influencer, nonprofit, organization, business, community_group),
  creatorDescription, targetAudience, whyItMatters.
  Step 2 Story: storyHeadline, storyIntro, storyParagraph (adds one paragraph; you may add several).
  Step 3 Visuals: adHeadline (max 60), adDescription, ctaText (button text like "Learn more").
  Step 4 Reach: locations (comma-separated places), channels ("facebook", "instagram" or "both"),
  facebookPercent (0-100, share of budget on Facebook when both are used), ageRange (like "25-45"; ages 13-65),
  interests (comma-separated).
  Step 5 Submit: fundingGoalDollars (whole number 100 to 100000), durationDays (14, 30, 45 or 60).
- generate_image (only while the editor is open): field = "cover" (step 1, wide cover photo) or "ad" (step 3,
  square ad image); value = a vivid description of a realistic photo for this campaign (scene, people, place,
  mood), no text, logos or real people. It takes about 30 seconds and appears in the editor by itself.
- go_step (only while the editor is open): value = "1".."5" (1 About, 2 Story, 3 Visuals, 4 Reach, 5 Submit).
- turn_off: switches you off (the user can turn you back on in Settings).
- set_theme: value = "light", "dark" or "system" (follow the phone). For "dark mode", "light mode", "night mode".
- follow_campaign / unfollow_campaign: target = a campaign label (like "c3"). "Follow this" means the campaign
  on screen (see "Campaign on screen"). Following sends them that campaign's updates.
- set_notification: field = "push" (phone notifications at all), "my_campaigns" (review decisions),
  "funding" (milestones, deadlines), "payments", "promotion" (ads and reports), "updates" (creator updates,
  comments) or "all" (every kind); value = "on" or "off". Security alerts can't be turned off.
You cannot: make or confirm payments, tick the rules confirmation, submit a campaign for review, upload
the user's own photos, or act for other people. Say so briefly when asked.
- Passwords: never change or handle a password. Say kindly that passwords are security-critical, so only
  they can change it, in Settings under Password (you may open settings for them).
- Sharing: you can't share a campaign. Tell them to tap the share button on the campaign page (you may open
  the campaign for them).

GUIDING THE USER THROUGH THE CAMPAIGN EDITOR (whenever the editor is open):
You walk them through the 5 steps in order (1 About, 2 Story, 3 Visuals, 4 Reach, 5 Submit), one at a time,
like a friendly coach, until the campaign is ready to submit.
- You know this campaign: "Filled so far" has its title, summary, story text, audience and everything else.
  Talk about it by name, answer questions about it from those values, and never act like you don't know it
  or ask for something already filled. If they open Sam in an existing draft, briefly say where it stands
  and carry on from the current step.
- Work only on the CURRENT step. First put EVERY detail the user just said into the right fields with
  fill_field, optional ones too (age range, interests, places). Then, if something is still needed on this
  step, ask ONE friendly question for it (expectsAnswer true). Never ask "anything else?".
- Items marked "(optional, ask once)" (age range, interests on Reach): ask about both once, in one question.
  If the user doesn't mind, fill that field with "skip".
- When nothing is still needed on the current step: say in one short sentence what this step now has
  (e.g. "Your story is written, it opens with the dark nights on Elm Street.") and ask "If it looks good,
  shall we move on?" (expectsAnswer true). Do this on EVERY step, including steps the draft already filled:
  never skip a step without showing it.
- When they agree ("yes", "looks good", "next", "move on"), use go_step to the next step and, in the same
  reply, start that step: if it is already complete, describe it and ask "If it looks good, shall we move
  on?"; otherwise ask its first question. If they want changes, make them with fill_field (or write it
  yourself) and ask again.
- Offer to do the writing: if they're unsure, or say "you write it" / "make it up" / "whatever you think",
  write it yourself from what you know about the campaign and fill it in (story paragraphs, summary, ad text).
  Keep their facts; never invent statistics or quotes.
- Images: the cover (step 1) and an ad image (step 3) are required. Ask if they'd like you to create one (or
  they can upload their own with the button on screen). Only use generate_image AFTER they say yes or ask for
  one, never in the same reply where you offer; then say it takes about 30 seconds. They can ask for another
  or a different image any time on that step ("make another ad image"): create it. While an image is being
  created ("Creating now"), don't start another; wait until it's ready.
- When a message in brackets says an image you created is ready, say: "I've made your <cover/ad> image. If it
  looks good, shall we move on?" (expectsAnswer true), unless something else on this step is still needed,
  then ask for that instead.
- Step 5: ask for the funding goal (and duration if they care). Then finish clearly: say you can't make
  payments or submit for them, and that they need to read and tick the rules box and tap "Submit for review"
  themselves. The team reviews it before it goes live.
- If the user wants to change something on an earlier step, use go_step back to that step and fill it.

ANOTHER CAMPAIGN: if a campaign was already drafted earlier in the conversation and the user asks to create
another one, ask the three questions again for the new one; don't reuse the earlier campaign's answers.

${APP_GUIDE}`;

const STEP_NAMES = ["About", "Story", "Visuals", "Reach", "Submit"];

function daysLeft(deadline: Date | null) {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86_400_000));
}

/** The real data Sam may talk about: live campaigns, and the user's own world, with the sums already
 * worked out (the model reads totals; it never has to add up money itself). */
async function knowledge(userId: string) {
  const now = new Date();
  const [user, live, mine, unread, payments, following, notes] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true, createdAt: true } }),
    prisma.campaign.findMany({
      where: { status: { in: [...PUBLIC_STATUSES] } },
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
      take: 30,
    }),
    prisma.campaign.findMany({ where: { creatorId: userId }, orderBy: { updatedAt: "desc" }, take: 15 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.contribution.findMany({
      where: { userId },
      select: {
        amountCents: true,
        feeCents: true,
        processingFeeCents: true,
        status: true,
        createdAt: true,
        campaign: { select: { id: true, title: true, category: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.follow.findMany({
      where: { userId },
      select: { campaign: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.notification.findMany({
      where: { userId },
      select: { title: true, body: true, readAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  const [stats, delivery] = await Promise.all([
    getStats([...live, ...mine].map((c) => c.id)),
    mine.length
      ? prisma.distributionMetric.groupBy({
          by: ["campaignId"],
          where: { campaignId: { in: mine.map((c) => c.id) } },
          _sum: { reach: true, impressions: true, clicks: true, adSpendCents: true },
        })
      : Promise.resolve([]),
  ]);
  // Short labels ("c3") instead of 36-character ids: easier for the model to copy exactly
  const refs = new Map<string, string>();
  const ref = (id: string) => {
    for (const [r, v] of refs) if (v === id) return r;
    const r = `c${refs.size + 1}`;
    refs.set(r, id);
    return r;
  };
  const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const pct = (raised: number, goal: number | null) => (goal ? Math.floor((raised / goal) * 100) : 0);

  const liveLines = live.map((c) => {
    const s = statsOf(stats, c.id);
    const left = c.status === "funding" ? daysLeft(c.fundingDeadline) : null;
    return `- ${ref(c.id)} | "${c.title}" | ${c.category ?? "other"} | ${STATUS_WORDS[c.status] ?? c.status} | ${formatUsd(s.raisedCents)} of ${formatUsd(c.fundingGoalCents ?? 0)} (${pct(s.raisedCents, c.fundingGoalCents)}%), ${s.backerCount} backers${left !== null ? `, ${left} days left` : ""} | ${(c.summary ?? "").slice(0, 140)}`;
  });

  // The user's own campaigns, with what their ads actually delivered
  const delivered = new Map(delivery.map((d) => [d.campaignId, d._sum]));
  const mineLines = mine.map((c) => {
    const s = statsOf(stats, c.id);
    const left = c.status === "funding" ? daysLeft(c.fundingDeadline) : null;
    const d = delivered.get(c.id);
    const ads = d?.impressions
      ? ` | ads so far: ${(d.reach ?? 0).toLocaleString("en-US")} people reached, ${(d.impressions ?? 0).toLocaleString("en-US")} views, ${(d.clicks ?? 0).toLocaleString("en-US")} clicks, ${formatUsd(d.adSpendCents ?? 0)} spent on ads`
      : "";
    return `- ${ref(c.id)} | "${c.title ?? "Untitled draft"}" | ${STATUS_WORDS[c.status] ?? c.status} | ${formatUsd(s.raisedCents)} raised of ${formatUsd(c.fundingGoalCents ?? 0)} goal (${pct(s.raisedCents, c.fundingGoalCents)}%), ${s.backerCount} backers${left !== null ? `, ${left} days left` : ""}${ads} | started ${day(c.createdAt)}`;
  });
  const raisedForMe = mine.reduce((sum, c) => sum + statsOf(stats, c.id).raisedCents, 0);

  // Money the user put in, totalled every way people ask about it
  const paid = payments.filter((p) => p.status === "succeeded");
  const sum = (list: typeof paid, f: (p: (typeof paid)[number]) => number) => list.reduce((t, p) => t + f(p), 0);
  const total = sum(paid, (p) => p.amountCents);
  const cardFees = sum(paid, (p) => p.processingFeeCents);
  const toAds = sum(paid, (p) => p.amountCents - p.feeCents);
  const reached = Math.round(sum(paid, (p) => (p.amountCents / 100) * reachPerDollar(p.campaign.category)));
  const thisMonth = paid.filter((p) => p.createdAt.getMonth() === now.getMonth() && p.createdAt.getFullYear() === now.getFullYear());
  const thisYear = paid.filter((p) => p.createdAt.getFullYear() === now.getFullYear());
  const byCampaign = new Map<string, { title: string; cents: number; times: number; last: Date }>();
  for (const p of paid) {
    const e = byCampaign.get(p.campaign.id) ?? { title: p.campaign.title ?? "Untitled", cents: 0, times: 0, last: p.createdAt };
    e.cents += p.amountCents;
    e.times += 1;
    byCampaign.set(p.campaign.id, e);
  }
  const notCharged = payments.filter((p) => p.status !== "succeeded" && p.status !== "pending").length;
  const biggest = paid.reduce<(typeof paid)[number] | null>((b, p) => (!b || p.amountCents > b.amountCents ? p : b), null);

  const moneyText = paid.length
    ? `Total contributed: ${formatUsd(total)} across ${paid.length} contribution${paid.length === 1 ? "" : "s"} to ${byCampaign.size} campaign${byCampaign.size === 1 ? "" : "s"}.
Card processing fees paid on top: ${formatUsd(cardFees)}, so total charged to their card: ${formatUsd(total + cardFees)}.
Of their contributions, ${formatUsd(toAds)} went to ads and ${formatUsd(total - toAds)} to the platform fee. Estimated people their money helps reach: about ${reached.toLocaleString("en-US")}.
This month: ${formatUsd(sum(thisMonth, (p) => p.amountCents))} in ${thisMonth.length} payment(s). This year: ${formatUsd(sum(thisYear, (p) => p.amountCents))} in ${thisYear.length} payment(s).
First contribution: ${day(paid[paid.length - 1]!.createdAt)}. Latest: ${day(paid[0]!.createdAt)} to "${paid[0]!.campaign.title}" (${formatUsd(paid[0]!.amountCents)}). Biggest: ${formatUsd(biggest!.amountCents)} to "${biggest!.campaign.title}".
${notCharged ? `Failed, declined or cancelled payments (never charged): ${notCharged}.\n` : ""}Per campaign:
${[...byCampaign.entries()].map(([id, e]) => `- ${ref(id)} | "${e.title}" | ${formatUsd(e.cents)} in ${e.times} payment${e.times === 1 ? "" : "s"}, last ${day(e.last)}`).join("\n")}`
    : `They haven't backed any campaign yet.${notCharged ? ` (${notCharged} payment attempt(s) failed or were cancelled; never charged.)` : ""}`;

  const noteLines = notes.map((n) => `- ${day(n.createdAt)}${n.readAt ? "" : " (unread)"}: ${n.title} - ${n.body.slice(0, 120)}`);

  const text = `Today is ${day(now)}. User: ${user.fullName}, member since ${day(user.createdAt)}.

THE USER'S MONEY (contributions, which people may call donations, payments, spending or giving):
${moneyText}

THE USER'S OWN CAMPAIGNS (${mine.length}; total raised for them: ${formatUsd(raisedForMe)}):
${mineLines.join("\n") || "(none yet)"}

CAMPAIGNS THEY FOLLOW (${following.length}): ${following.map((f) => `${ref(f.campaign.id)} "${f.campaign.title}"`).join(", ") || "none"}

THEIR NOTIFICATIONS (${unread} unread; newest first):
${noteLines.join("\n") || "(none)"}

LIVE CAMPAIGNS ON THE PLATFORM:
${liveLines.join("\n") || "(none)"}`;
  // Slug or id of every listed campaign → its label, to name the campaign on screen
  const screenRefs = new Map<string, string>();
  for (const c of [...live, ...mine]) {
    const label = `${ref(c.id)} "${c.title ?? "Untitled draft"}"`;
    screenRefs.set(c.id, label);
    if (c.slug) screenRefs.set(c.slug, label);
  }
  return { text, refs, screenRefs };
}

function contextText(ctx: TurnContext) {
  const lines = [`The user is on screen: ${ctx.screen}`];
  const ed = ctx.editor;
  if (ed) {
    const filled = Object.entries(ed.fields)
      .filter(([, v]) => v !== null && v !== "" && v !== 0)
      .map(([k, v]) => `${k}: ${String(v).slice(0, 200)}`);
    lines.push(
      `The campaign editor is open on step ${ed.step} of 5 (${STEP_NAMES[ed.step - 1]}).`,
      `Filled so far: ${filled.join(" | ") || "(nothing yet)"}`,
      `Still needed on this step: ${ed.stepMissing?.join(", ") || "(nothing: this step is complete; show it briefly and ask if it looks good to move on)"}`,
      `Still needed on later steps: ${ed.missing.filter((m) => !ed.stepMissing?.includes(m)).join(", ") || "(nothing)"}`,
    );
    if (ed.creatingImage) lines.push(`Creating now: the ${ed.creatingImage} image (about 30 seconds).`);
  }
  return lines.join("\n");
}

/** Drops actions that point at things that don't exist, so the app never acts on a made-up id. */
function sanitize(
  actions: SamAction[],
  knownIds: Set<string>,
  ctx: TurnContext,
) {
  return actions
    .filter((a) => {
      if (!(ACTIONS as readonly string[]).includes(a.type)) return false;
      if (
        a.type === "fill_field" &&
        !(FIELDS as readonly string[]).includes(a.field ?? "")
      )
        return false;
      if (a.type === "navigate")
        return (SCREENS as readonly string[]).includes(a.target ?? "");
      if (a.type === "open_campaign" || a.type === "back_campaign" || a.type === "follow_campaign" || a.type === "unfollow_campaign")
        return !!a.target && knownIds.has(a.target);
      if (a.type === "set_theme") return ["light", "dark", "system"].includes(a.value ?? "");
      if (a.type === "set_notification")
        return ["push", "my_campaigns", "funding", "payments", "promotion", "updates", "all"].includes(a.field ?? "") && ["on", "off"].includes(a.value ?? "");
      if (a.type === "search" || a.type === "draft_from_idea")
        return !!a.value?.trim();
      if (a.type === "show_category") return CATEGORIES.includes(a.value ?? "");
      if (a.type === "fill_field")
        return !!ctx.editor && !!a.field && a.value !== null;
      if (a.type === "generate_image")
        return !!ctx.editor && (a.field === "cover" || a.field === "ad") && !!a.value?.trim() && !ctx.editor.creatingImage;
      if (a.type === "go_step")
        return !!ctx.editor && /^[1-5]$/.test(a.value ?? "");
      return true;
    })
    .slice(0, 12);
}

export async function runTurn(
  userId: string,
  input: {
    text?: string;
    audio?: { path: string; originalname: string; mimetype: string };
  },
  ctx: TurnContext,
) {
  if (!isOpenAiConfigured()) {
    const reply =
      "My brain isn't connected right now, so I can't help yet. Please try again later.";
    return {
      transcript: input.text ?? "",
      reply,
      actions: [] as SamAction[],
      audioUrl: await audioUrl(reply),
    };
  }

  // Load the app data while the speech is being transcribed
  const dataReady = knowledge(userId);
  dataReady.catch(() => {}); // awaited below; an early return must not leave it unhandled
  let transcript = input.text?.trim() ?? "";
  if (input.audio)
    transcript = await transcribe(
      input.audio.path,
      input.audio.originalname || "speech.m4a",
      input.audio.mimetype || "audio/mp4",
    );
  // "Hey Sam, ..." is how people start; the greeting itself isn't the request
  const request = transcript
    .replace(/^\s*(hey|hi|hello|ok|okay)[,!.\s]+sam\b[,!.\s]*/i, "")
    .trim();

  if (!request) {
    const reply = transcript
      ? "Hi! What can I help you with?"
      : "Sorry, I didn't catch that. Could you say it again?";
    return {
      transcript,
      reply,
      actions: [] as SamAction[],
      audioUrl: await audioUrl(reply),
    };
  }

  const { text: data, refs, screenRefs } = await dataReady;
  const onScreenKey = ctx.screen.match(/^\/campaign\/([^/?]+)/)?.[1];
  const onScreen = onScreenKey ? screenRefs.get(decodeURIComponent(onScreenKey)) : undefined;
  const history = ctx.history
    .map((h) => `${h.role === "user" ? "User" : "Sam"}: ${h.text}`)
    .join("\n");

  const messages = [
    { role: "system" as const, content: `${RULES}\n\n${data}` },
    {
      role: "user" as const,
      content: `${contextText(ctx)}${onScreen ? `\nCampaign on screen: ${onScreen}` : ""}${history ? `\nRecent conversation:\n${history}` : ""}\n\nThe user says: "${request}"`,
    },
  ];
  // A conversation can't wait long: a stalled call is retried once, quickly
  // Short timeout + capped length: a reply is a sentence or two and a few actions
  const think = () =>
    chatJson<Brain>(messages, "sam_turn", SCHEMA, { timeoutMs: 15_000, maxTokens: 700, model: env.SAM_MODEL });
  const brain = await think().catch(() => think());
  if (env.NODE_ENV !== "production")
    console.info("[sam]", request, "→", JSON.stringify(brain));

  let reply = brain.reply.trim() || "Okay.";
  let expectsAnswer = brain.expectsAnswer === true;
  // All three answers are in (often in one sentence): draft now, rather than asking anything more
  const idea = brain.campaignIdea;
  const ideaReady =
    !ctx.editor &&
    !!idea &&
    [idea.about, idea.audience, idea.why].every((x) => x.trim().length > 2) &&
    !brain.actions.some((a) => a.type?.trim() === "draft_from_idea");
  if (ideaReady) {
    brain.actions = [
      {
        type: "draft_from_idea",
        target: null,
        field: null,
        value: `About: ${idea.about.trim()}. Who it should reach: ${idea.audience.trim()}. Why it matters: ${idea.why.trim()}.`,
      },
    ];
    reply = "Great, I have everything I need. Writing your draft now.";
    expectsAnswer = false;
  }
  // Campaign labels back to real ids
  // The model isn't always tidy about which slot it uses: take the argument from either, and clean labels
  const raw = brain.actions.map((a) => {
    const target = a.target?.trim() || null;
    const value = a.value?.trim() || null;
    const arg = value ?? target;
    const type = a.type.trim();
    // Screen and category names are plain words: drop stray punctuation ("health{", "payments.")
    const word = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z_]/g, "");
    if (type === "set_theme") return { type, target: null, field: null, value: word(arg) };
    if (type === "set_notification") {
      const v = word(value ?? "");
      return { type, target: null, field: word(a.field?.trim() || target), value: v === "true" || v === "enable" ? "on" : v === "false" || v === "disable" ? "off" : v };
    }
    if (type === "open_campaign" || type === "back_campaign" || type === "follow_campaign" || type === "unfollow_campaign") {
      return {
        type,
        target:
          (target ?? value ?? "").toLowerCase().match(/c\d+/)?.[0] ?? null,
        field: null,
        value: null,
      };
    }
    if (type === "navigate")
      return { type, target: word(target ?? value), field: null, value: null };
    if (type === "generate_image") {
      // "cover"/"ad" may land in field or target; the description in value
      const kind = [a.field, target].map(word).find((w) => w === "cover" || w === "ad") ?? null;
      return { type, target: null, field: kind, value: a.value?.trim() || null };
    }
    if (type === "fill_field")
      return { type, target: null, field: a.field?.trim() || target, value };
    return {
      type,
      target,
      field: a.field?.trim() || null,
      value: type === "show_category" ? word(arg) : arg,
    };
  }) as SamAction[];
  const sane = sanitize(raw, new Set(refs.keys()), ctx).map((a) =>
    a.type === "open_campaign" || a.type === "back_campaign" || a.type === "follow_campaign" || a.type === "unfollow_campaign"
      ? { ...a, target: refs.get(a.target!)! }
      : a,
  );
  // A reply that offers an image ("would you like me to create one?") waits for the answer first
  // Only an offer about the image itself counts ("Would you like me to create one?"); a reply that is
  // already creating it may still ask the next question ("Creating it now. Would you like to set a location?")
  const offering =
    /\b(would you like|do you want|want me to|shall i|should i|like me to)\b[^.?!]*\b(image|photo|picture|one)\b/i.test(reply) &&
    !/\b(creating|making|generating)\b/i.test(reply);
  let actions = offering ? sane.filter((a) => a.type !== "generate_image") : sane;

  // The user said yes to Sam's image offer (or asked for an image) while this step needs one: the image
  // is always started, whatever the model decided
  const editorNow = ctx.editor;
  const neededImage = editorNow?.stepMissing?.includes("coverImage")
    ? ("cover" as const)
    : editorNow?.stepMissing?.includes("adImage")
      ? ("ad" as const)
      : null;
  // The image this step is about (cover on About, ad on Visuals), for "make another one"
  const stepImage = editorNow?.step === 1 ? ("cover" as const) : editorNow?.step === 3 ? ("ad" as const) : null;
  const lastSam = [...ctx.history].reverse().find((h) => h.role === "sam")?.text ?? "";
  const saidYes = /^\s*(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|do it|of course|absolutely|sounds good|looks good|next|move on|continue|let's go)\b/i.test(request);
  const askedForImage = /\b(make|create|generate|design|do)\b[^.?!]*\b(image|picture|photo|one)\b/i.test(request);
  const wantsAnother = askedForImage && /\b(another|new|different|again|more|second|other)\b/i.test(request);
  // An offer to create an image, not "I've made your image. Looks good?"
  const offeredImage =
    /\b(create|make|generate)\b[^.?!]*\b(image|picture|photo|one)\b[^.?!]*\?\s*$/i.test(lastSam.trim()) &&
    !/\b(made|ready|looks good)\b/i.test(lastSam);
  const imageKind = neededImage ?? (wantsAnother ? stepImage : null);
  if (
    editorNow &&
    imageKind &&
    !editorNow.creatingImage &&
    ((saidYes && offeredImage) || askedForImage) &&
    !actions.some((a) => a.type === "generate_image")
  ) {
    const f = editorNow.fields;
    const about = [f.title, f.summary].filter((x) => typeof x === "string" && x.trim()).join(". ");
    actions = [
      ...actions,
      {
        type: "generate_image",
        target: null,
        field: imageKind,
        value: `A realistic, warm photo for a community campaign: ${about || "a local cause"}. Real-life scene with everyday people and places, no text, logos or recognizable real people.`,
      },
    ];
    reply = `Creating ${neededImage ? "your" : "a new"} ${imageKind === "cover" ? "cover" : "ad"} image now. It takes about 30 seconds, I'll tell you when it's ready.`;
    expectsAnswer = false;
  }
  // "Yes, looks good" to "shall we move on?" on a finished step always moves to the next step
  const moveOnQuestion = /\b(move on|next step|continue|go on)\b[^.!]*\?/i;
  const askedToMoveOn = moveOnQuestion.test(lastSam);
  // Notes the app sends by itself ("(You are now on step 2, Story...)") never move the editor
  const appNote = request.startsWith("(");
  let continueGuide = false;
  // "move", "next", "go ahead"... or "yes" to Sam's "shall we move on?"
  const wantsNext = !appNote && (/\b(move|next|continue|go ahead|proceed|forward)\b/i.test(request) || (saidYes && askedToMoveOn));
  const agreedToMoveOn =
    !!editorNow && editorNow.step < 5 && (editorNow.stepMissing?.length ?? 0) === 0 && wantsNext;
  if (editorNow) {
    const forward = (a: SamAction) => a.type === "go_step" && Number(a.value) > editorNow.step;
    if (agreedToMoveOn && !actions.some((a) => a.type === "generate_image")) {
      // Exactly one step forward
      actions = [
        ...actions.filter((a) => !forward(a)),
        { type: "go_step", target: null, field: null, value: String(editorNow.step + 1) },
      ];
      // Sam only says he's moving; once the next step is on screen the app asks him about it, so he
      // describes what's really there instead of guessing
      reply = "Great, moving on.";
      expectsAnswer = false;
      continueGuide = true;
    } else if (appNote || moveOnQuestion.test(reply)) {
      // Sam is asking whether to move on: he waits for the answer instead of moving now, and the mic
      // stays closed so the user has time to look at the screen (they tap Sam when ready)
      actions = actions.filter((a) => !forward(a));
      if (moveOnQuestion.test(reply)) expectsAnswer = false;
    }
  }
  const drafting = actions.some((x) => x.type === "draft_from_idea" || x.type === "new_draft");
  // Collecting the three answers: the app shows the "Create with Sam" screen with what's known so far
  const collecting = !ctx.editor && !drafting && brain.creatingCampaign === true;
  if (collecting) actions = actions.filter((a) => a.type !== "navigate");
  const intake = collecting ? { about: idea?.about?.trim() ?? "", audience: idea?.audience?.trim() ?? "", why: idea?.why?.trim() ?? "" } : null;
  // Last step: once the goal is set only the user's own part is left, so Sam says so plainly and stops asking
  const ed = ctx.editor;
  const goalDone = !!ed && (actions.some((x) => x.type === "fill_field" && x.field === "fundingGoalDollars") || !ed.stepMissing?.includes("fundingGoalDollars"));
  // In the editor Sam never leaves the campaign by himself ("submit"/"create" in the talk made the model
  // open the Create screen); only a user who asks to go somewhere ("go to", not "go ahead") is taken there
  const askedToGo = /\b(go to|go back|open|take me|show me|navigate|leave|exit|switch to)\b/i.test(request);
  if (ctx.editor && !askedToGo) actions = actions.filter((x) => x.type !== "navigate");
  // Starting another campaign from inside the editor only when the user asks for a new one
  const askedForNew = /\b(new|another|different|second|start over)\b[^.?!]*\b(campaign|draft|one)\b/i.test(request);
  if (ctx.editor && !askedForNew)
    actions = actions.filter((x) => x.type !== "draft_from_idea" && x.type !== "new_draft");
  const finishing = !!ed && ed.step === 5 && goalDone && !askedToGo && !askedForNew;
  if (finishing) {
    if (!/can.?t|cannot/i.test(reply)) {
      // Keep Sam's first sentence ("Got it, your goal is $2,000.") and end with the user's part
      const first = reply.match(/^[^.!?]*[.!?]/)?.[0] ?? "";
      reply = `${first} That's everything I can do: I can't make payments or submit for you. Please tick the rules box and tap Submit for review yourself.`.trim();
    }
    expectsAnswer = false;
    // The user stays on this last step to tick the rules box and submit: nothing may take them elsewhere
    actions = actions.filter((x) => x.type === "fill_field");
  }
  // The mic reopens only for a real question. A reply that asks nothing ("Okay, tell me when you're done.")
  // or a user who handed off ("I'll upload it", "ok, I'll tell you", "stop") ends the conversation there
  const askedQuestion = /\?["')\s]*$/.test(reply);
  const handOff =
    /\b(i'?ll|i will|i'm going to|im going to|let me)\b[^.?!]*\b(upload|tell you|let you know|do it|do that|add it|add one|handle|come back|get back|myself|later)\b/i.test(request) ||
    /^\s*(stop|stop it|stop listening|that's all|thats all|that's it|thats it|nothing|nothing else|never ?mind|bye|goodbye|thanks?|thank you|no thanks?)[\s.!]*$/i.test(request) ||
    (!/\?\s*$/.test(lastSam.trim()) && /^\s*(ok|okay|alright|all right|cool|fine|got it|sure|great)[\s,.!]*(thanks?|thank you)?[\s.!]*$/i.test(request));
  // Moving the editor to the next step always comes with that step's first question
  const steppedForward = actions.some((x) => x.type === "go_step" && ctx.editor && Number(x.value) > ctx.editor.step);
  // Sam asked "shall we move on?" on steps 1-4: the app lets the user check and edit the fields until they answer
  const reviewStep = !!ed && ed.step < 5 && !continueGuide && moveOnQuestion.test(reply);
  return {
    transcript,
    reply,
    actions,
    expectsAnswer: !drafting && !continueGuide && !handOff && askedQuestion && (expectsAnswer || steppedForward),
    // The app should ask Sam about the step it just opened
    continueGuide,
    reviewStep,
    intake,
    audioUrl: await audioUrl(reply),
  };
}

/** Speaks a line and returns where the app can play it; null if speech is unavailable (the app shows text). */
export async function audioUrl(text: string) {
  try {
    return `/assistant/audio/${await speakToClip(text)}`;
  } catch (err) {
    console.error("Sam couldn't speak:", err);
    return null;
  }
}
