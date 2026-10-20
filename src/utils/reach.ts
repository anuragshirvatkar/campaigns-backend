import { appConfig } from "../config/app.config.js";

const { reach } = appConfig;

export function cpmCentsFor(category: string | null | undefined) {
  return (category && reach.cpmByCategoryCents[category]) || reach.cpmDefaultCents;
}

/**
 * People reached per dollar contributed:
 *   deployRate × 1000 / (CPM × frequency)
 * With the defaults: 0.8 × 1000 / (16.34 × 1.8) ≈ 27.2
 */
export function reachPerDollar(category: string | null | undefined) {
  const cpmDollars = cpmCentsFor(category) / 100;
  return (reach.deployRate * 1000) / (cpmDollars * reach.frequency);
}

export type ReachEstimate = { low: number; mid: number; high: number };

/** Estimated people reached for an amount, as a range (never a promise). */
export function estimateReach(amountCents: number, perDollar: number): ReachEstimate {
  const mid = Math.round((amountCents / 100) * perDollar);
  const spread = reach.estimateRangePct / 100;
  return {
    low: roundNice(mid * (1 - spread)),
    mid: roundNice(mid),
    high: roundNice(mid * (1 + spread)),
  };
}

function roundNice(n: number) {
  if (n < 100) return Math.round(n);
  if (n < 10_000) return Math.round(n / 10) * 10;
  return Math.round(n / 100) * 100;
}
