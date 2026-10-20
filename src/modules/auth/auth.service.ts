import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { sendEmail } from "../../lib/email.js";
import { prisma } from "../../lib/prisma.js";
import { signToken } from "../../lib/jwt.js";
import { AppError } from "../../utils/app-error.js";
import { toPublicUser } from "../users/users.mapper.js";
import { notifyUsers } from "../notifications/notifications.service.js";
import type { ForgotPasswordBody, GoogleBody, LoginBody, ResetPasswordBody, SignupBody } from "./auth.schema.js";

const BCRYPT_ROUNDS = 10;

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export async function signup(input: SignupBody) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  try {
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash, fullName: input.fullName },
    });
    return { token: signToken(user.id), user: toPublicUser(user) };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw AppError.conflict("An account with this email already exists. Try logging in.");
    }
    throw err;
  }
}

export async function login(input: LoginBody) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  return { token: signToken(user.id), user: toPublicUser(user) };
}

// Reset codes aren't stored: each is derived from the user's current password hash and the minute it
// was issued. Changing the password therefore voids every outstanding code.
const RESET_CODE_MINUTES = 15;

function resetCode(user: { id: string; passwordHash: string }, minute: number) {
  const mac = createHmac("sha256", env.JWT_SECRET).update(`reset:${user.id}:${user.passwordHash}:${minute}`).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export async function forgotPassword({ email }: ForgotPasswordBody) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const code = resetCode(user, Math.floor(Date.now() / 60_000));
  const sent = await sendEmail({
    to: user.email,
    subject: `${code} is your Campaigns reset code`,
    text: `Hi ${user.fullName.split(" ")[0]},

Your code to reset your Campaigns password is ${code}. It expires in ${RESET_CODE_MINUTES} minutes.

If you didn't ask for this, you can ignore this email. Your password stays the same.`,
    html: `<div style="font-family:Arial,sans-serif;color:#26264A;max-width:420px">
      <p>Hi ${user.fullName.split(" ")[0]},</p>
      <p>Your code to reset your Campaigns password:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#6C5DE8;margin:16px 0">${code}</p>
      <p>It expires in ${RESET_CODE_MINUTES} minutes.</p>
      <p style="color:#7D7E9D;font-size:13px">If you didn't ask for this, you can ignore this email. Your password stays the same.</p>
    </div>`,
  });
  // Lets local testing work without email delivery
  if (!sent && env.NODE_ENV !== "production") console.info(`[auth] reset code for ${user.email}: ${code}`);
}

export async function resetPassword({ email, code, newPassword }: ResetPasswordBody) {
  const wrong = () => new AppError(400, "INVALID_RESET_CODE", "That code is wrong or has expired. Request a new one.");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw wrong();
  const now = Math.floor(Date.now() / 60_000);
  const given = Buffer.from(code);
  let ok = false;
  for (let m = now; m > now - RESET_CODE_MINUTES; m--) {
    if (timingSafeEqual(Buffer.from(resetCode(user, m)), given)) ok = true;
  }
  if (!ok) throw wrong();

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await notifyUsers([user.id], {
    type: "security_alert",
    title: "Your password was reset",
    body: "Your password was reset with a code sent to your email. If this wasn't you, reset it again right away and contact support.",
    eventKey: `password-reset:${Date.now()}`,
  });
  return { token: signToken(updated.id), user: toPublicUser(updated) };
}

type GoogleClaims = { aud?: string; iss?: string; exp?: string; email?: string; email_verified?: string | boolean; name?: string; picture?: string };

/** Asks Google to check the ID token's signature and expiry, then checks it was issued for our app. */
async function verifyGoogleToken(idToken: string) {
  const invalid = () => new AppError(401, "INVALID_GOOGLE_TOKEN", "Google sign-in failed. Please try again.");
  let claims: GoogleClaims;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw invalid();
    claims = (await res.json()) as GoogleClaims;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, "GOOGLE_UNAVAILABLE", "Couldn't reach Google. Please try again.");
  }
  const issuerOk = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (claims.aud !== env.GOOGLE_WEB_CLIENT_ID || !issuerOk || !claims.email || !verified) throw invalid();
  if (Number(claims.exp) * 1000 < Date.now()) throw invalid();
  return { email: claims.email.trim().toLowerCase(), name: claims.name?.trim(), picture: claims.picture };
}

/**
 * Signs in with Google. Google has verified the email, so an existing account with the same email
 * is signed in; otherwise one is created. Google-only accounts get an unusable random password.
 */
export async function google(input: GoogleBody) {
  const profile = await verifyGoogleToken(input.idToken);
  let user = await prisma.user.findUnique({ where: { email: profile.email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS);
    try {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          passwordHash,
          fullName: (profile.name || profile.email.split("@")[0] || "Campaigns user").slice(0, 80),
          avatarUrl: profile.picture ?? null,
        },
      });
    } catch (err) {
      // Two sign-ins racing: the other one created it
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      user = await prisma.user.findUniqueOrThrow({ where: { email: profile.email } });
    }
  } else if (!user.avatarUrl && profile.picture) {
    user = await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: profile.picture } });
  }
  return { token: signToken(user.id), user: toPublicUser(user) };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.unauthorized();
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, "INVALID_PASSWORD", "Your current password is incorrect.");
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}
