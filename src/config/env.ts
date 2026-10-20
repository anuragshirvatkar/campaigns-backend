import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("30d"),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  // Public address of this API; seeded campaigns link to its demo documents
  PUBLIC_URL: z.string().url().default("https://campaign-one.64-227-171-165.sslip.io"),
  CLOUDINARY_FOLDER: z.string().min(1).default("campaign-one"),
  // Demo lifecycle speed: seconds per timed step (review, distribution prep, each delivery report)
  DEMO_STEP_SEC: z.coerce.number().int().min(1).max(3600).default(60),
  // How long the simulated review takes before a submitted campaign goes live
  REVIEW_DELAY_SEC: z.coerce.number().int().min(1).max(3600).default(20),
  SCHEDULER_INTERVAL_SEC: z.coerce.number().int().min(1).max(300).default(5),
  // Optional: AI features fall back to demo mode when the key is missing
  OPENAI_API_KEY: z.string().optional().transform((v) => v || undefined),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  // Password-reset emails. Without a verified domain, Resend only delivers to the account owner's address
  RESEND_API_KEY: z.string().optional().transform((v) => v || undefined),
  EMAIL_FROM: z.string().min(1).default("Campaigns <onboarding@resend.dev>"),
  // Google sign-in: ID tokens must be issued for this OAuth web client (public, not a secret)
  GOOGLE_WEB_CLIENT_ID: z.string().min(1).default("13841307072-9v9qr1c0bonfm8lqt5a4g4eiuu5ku41h.apps.googleusercontent.com"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
