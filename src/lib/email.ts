import { env } from "../config/env.js";

type Email = { to: string; subject: string; text: string; html?: string };

/**
 * Sends an email through Resend. Returns false (and logs) instead of throwing, so callers can keep
 * their responses identical whether or not delivery worked.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set; not sending "${email.subject}" to ${email.to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[email] Resend rejected "${email.subject}": ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] Couldn't reach Resend for "${email.subject}"`, err);
    return false;
  }
}
