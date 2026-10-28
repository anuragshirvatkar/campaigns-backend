import { rateLimit } from "express-rate-limit";

const message = (text: string) => ({ error: { code: "RATE_LIMITED", message: text } });

// Login/signup: slows down password guessing
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Too many attempts. Please wait a few minutes and try again."),
});

// AI calls cost money: keyed per user (these routes require login)
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: message("You've used the AI assistant a lot this hour. Please try again later."),
});

// Images cost more than text, so they get a tighter budget on top of the general AI limit
export const aiImageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: message("You've created a lot of images this hour. Please try again later, or upload one."),
});

// Sam: each turn is speech-to-text + a model call + speech; generous for a conversation, capped for cost
export const assistantLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 150,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: message("Sam needs a short break. Please try again in a little while."),
});
