// Simulated payment provider. There are no real charges anywhere in this prototype.
// Like a real provider's test mode, the card number decides the outcome, so every
// payment state (success, declined, failed) can be demonstrated on purpose.
import { randomBytes } from "node:crypto";

export type ChargeResult =
  | { status: "succeeded"; paymentRef: string }
  | { status: "rejected" | "failed"; reason: string };

export const DEMO_CARDS = [
  { number: "4242 4242 4242 4242", outcome: "succeeded", description: "Payment succeeds" },
  { number: "4000 0000 0000 0002", outcome: "rejected", description: "Card declined" },
  { number: "4000 0000 0000 9995", outcome: "rejected", description: "Insufficient funds" },
  { number: "4000 0000 0000 0119", outcome: "failed", description: "Provider error" },
] as const;

export function charge(cardNumber: string): ChargeResult {
  switch (cardNumber.replace(/\D/g, "")) {
    case "4242424242424242":
      return { status: "succeeded", paymentRef: `demo_pay_${randomBytes(8).toString("hex")}` };
    case "4000000000000002":
      return { status: "rejected", reason: "Your card was declined. You were not charged." };
    case "4000000000009995":
      return { status: "rejected", reason: "Your card has insufficient funds. You were not charged." };
    case "4000000000000119":
      return { status: "failed", reason: "The payment provider had a problem. You were not charged. Please try again." };
    default:
      return { status: "rejected", reason: "Your card was declined. You were not charged." };
  }
}
