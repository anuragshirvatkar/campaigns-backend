import { appConfig } from "../config/app.config.js";

export function platformFeeCents(amountCents: number) {
  return Math.round((amountCents * appConfig.fees.platformFeePct) / 100);
}

export function processingFeeCents(amountCents: number) {
  return Math.round((amountCents * appConfig.fees.processingFeePct) / 100);
}

/** The part of a contribution that is spent on ads. */
export function adShareCents(amountCents: number) {
  return amountCents - platformFeeCents(amountCents);
}

export function formatUsd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
