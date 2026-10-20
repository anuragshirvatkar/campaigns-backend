import { env } from "./env.js";

// Business rules and demo assumptions. Change values here, restart, and the whole app follows;
// GET /api/config exposes them to the mobile app so both sides show the same numbers.

export const appConfig = {
  currency: "USD",

  fees: {
    // Taken from inside the contribution: $25 → $20 ads + $5 fee
    platformFeePct: 20,
    // Card processing, added on top of the contribution
    processingFeePct: 2.9,
  },

  // Illustrative reach model (labelled as an estimate everywhere it is shown)
  reach: {
    deployRate: 0.8, // share of each dollar that becomes ad spend
    frequency: 1.8, // average times one person sees the ad
    ctr: 0.012, // share of impressions that become clicks
    cpmDefaultCents: 1634, // cost per 1,000 impressions
    cpmByCategoryCents: {} as Partial<Record<string, number>>,
    estimateRangePct: 15, // shown as ±15% so we never promise one fixed number
  },

  // Distribution channels the platform can place ads on (dummy delivery in this prototype)
  channels: ["facebook", "instagram"] as const,

  funding: {
    minGoalCents: 10_000, // $100
    maxGoalCents: 10_000_000, // $100,000
    minContributionCents: 100, // $1
    maxContributionCents: 1_000_000, // $10,000
    presetAmountsCents: [1000, 2500, 5000, 10000],
    durationDays: [14, 30, 45, 60],
    milestonesPct: [25, 50, 75, 100],
    deadlineReminderHours: 72,
  },

  // Demo lifecycle timers (there is no human reviewer or real ad platform).
  // DEMO_STEP_SEC in .env speeds them up, e.g. for recording a demo video.
  lifecycle: {
    approvalDelaySec: env.REVIEW_DELAY_SEC, // submitted → approved & live
    distributionPrepDelaySec: env.DEMO_STEP_SEC, // funded/ended → distribution prep → promoting
    metricsTickSec: env.DEMO_STEP_SEC, // how often promotion numbers are reported
    promotionTicks: 6, // promotion spends the budget over this many ticks, then completes
    schedulerIntervalSec: env.SCHEDULER_INTERVAL_SEC,
  },

  // Creators can edit while these are true; edits to a live campaign send it back to review
  editableStatuses: ["draft", "submitted", "changes_requested", "approved", "funding"] as const,

  comments: {
    autoHideReports: 3,
    maxLength: 1000,
  },
} as const;

export const PUBLIC_STATUSES = [
  "funding",
  "funded",
  "funding_ended",
  "distribution_prep",
  "promoting",
  "completed",
] as const;
