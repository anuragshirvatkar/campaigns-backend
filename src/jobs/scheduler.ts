// Runs the timed parts of the campaign lifecycle. There is one server process, so a simple
// interval is enough. Every job only acts on campaigns whose time has come and uses
// conditional updates, so a run after downtime simply catches up on anything overdue.
import { appConfig } from "../config/app.config.js";
import {
  endExpiredFunding,
  prescreenSubmitted,
  remindDeadlines,
  startDistributionPrep,
  startPromotion,
} from "../modules/campaigns/campaign-lifecycle.service.js";
import { recordPromotionTicks } from "../modules/metrics/metrics.service.js";

const JOBS: [name: string, run: (now: Date) => Promise<void>][] = [
  ["pre-screen submitted campaigns", prescreenSubmitted],
  ["end expired funding", endExpiredFunding],
  ["remind approaching deadlines", remindDeadlines],
  ["start distribution prep", startDistributionPrep],
  ["start promotion", startPromotion],
  ["record promotion delivery", recordPromotionTicks],
];

let running = false;

async function tick() {
  if (running) return; // previous run still busy
  running = true;
  try {
    for (const [name, run] of JOBS) {
      try {
        await run(new Date());
      } catch (err) {
        console.error(`Job "${name}" failed:`, err);
      }
    }
  } finally {
    running = false;
  }
}

export function startScheduler() {
  void tick(); // catch up right away after a restart
  const timer = setInterval(() => void tick(), appConfig.lifecycle.schedulerIntervalSec * 1000);
  return () => clearInterval(timer);
}
