// What Sam knows about the app itself: how it works, the rules, the numbers and where everything
// lives. Numbers come from appConfig, so Sam always quotes the same figures the app shows.
import { appConfig } from "../../config/app.config.js";
import { reachPerDollar } from "../../utils/reach.js";

const f = appConfig.fees;
const fund = appConfig.funding;
const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;
// People reached per $1 contributed: the same figure the Home screen shows
const perDollar = Math.round(reachPerDollar(null));

/** Plain words for each campaign status (what the user would call it). */
export const STATUS_WORDS: Record<string, string> = {
  draft: "draft, not submitted yet",
  submitted: "waiting for review by the Campaigns team",
  changes_requested: "the team asked for changes before approving it",
  rejected: "not approved",
  approved: "approved, about to open for funding",
  funding: "live and raising money",
  funded: "reached its goal",
  funding_ended: "funding closed",
  distribution_prep: "ads being set up",
  promoting: "ads running now",
  completed: "finished, final report ready",
  cancelled: "cancelled",
};

export const APP_GUIDE = `ABOUT THE APP (use these facts when people ask how things work):
- Campaigns is a community-funded advertising platform. A creator writes a message (a cause, local issue or
  story); people "back" it with money; that money buys ads so the message reaches people outside the
  creator's own network. One account can browse, back, follow, comment and create.
- Journey: Create -> Review by the Campaigns team -> Funding (14, 30, 45 or 60 days) -> Ads set up -> Ads run
  on Facebook and Instagram until the budget is spent -> Final report with reach, impressions and clicks.
- Money: ${100 - f.platformFeePct}% of every contribution becomes ad budget, ${f.platformFeePct}% is the platform fee (for $25: $20 ads,
  $5 fee). Card processing of about ${f.processingFeePct}% is added on top at checkout. Contributions are NOT donations:
  the creator never receives the money, it isn't tax-deductible, and successful contributions can't be
  refunded (failed, declined or cancelled payments are never charged). Campaigns keep what they raise even
  if they miss the goal; the ad budget is always spent in full.
- Amounts: contributions from ${usd(fund.minContributionCents)} to ${usd(fund.maxContributionCents)}; quick amounts ${fund.presetAmountsCents.map(usd).join(", ")}.
  Goals from ${usd(fund.minGoalCents)} to ${usd(fund.maxGoalCents)}. Backers get milestone alerts at ${fund.milestonesPct.join("%, ")}%.
- Reach: roughly ${perDollar} people per $1 contributed. It's an estimate shown as a range, never a promise.
- Review: the Campaigns team checks story, sources, visuals, ad and targeting; an automated check helps. It is
  not a fact-check or endorsement. Editing a live campaign sends it back to review. No election ads or
  fundraising for candidates or parties.
- Privacy: backers are private unless they choose to be listed (then only like "Emily C.").
- This is a hackathon prototype: payments use a demo card and ad delivery is simulated.

WHERE THINGS ARE (navigate targets in brackets):
- [home] Home: intro and what $1 can do. [explore] Explore: all live campaigns, search and categories.
- [create] Create: start a campaign by form or by voice, and the user's drafts. [voice_create] talk to create.
- [activity] Activity: notifications (milestones, updates, review decisions, ads starting, reports).
- [profile] Profile: the user's numbers and menu. [my_campaigns] campaigns they created (drafts too).
- [backed] campaigns they backed. [following] campaigns they follow. [payments] payment history and receipts.
- [settings] Settings: name, password, theme (light/dark), notification choices, turning Sam on or off.
- [how_it_works] How it works. [faq] FAQs. [help] Help (drafts, review, editing live campaigns, failed
  payments, receipts, notifications). [contact] Contact support by email. [about] About. [partners] Ad partners.
  [terms] Terms. [privacy] Privacy. [guidelines] Community guidelines.
- Drafts save automatically. A campaign's page shows its story, sources, funding, backers, comments, updates
  and (after ads run) its report. Receipts: payments screen, tap a payment.`;
