import { z } from "zod";

export const adminTabs = ["pending", "changes_requested", "approved", "rejected"] as const;

export const adminCampaignsQuery = z.object({
  tab: z.enum(adminTabs).default("pending"),
});

const issue = z.object({
  step: z.coerce.number().int().min(1).max(5),
  message: z.string().trim().min(1).max(300),
});

export const reviewBody = z
  .object({
    decision: z.enum(["approved", "changes_requested", "rejected"]),
    // The message the creator reads with the decision
    note: z.string().trim().max(600).optional(),
    // What to fix, each pointing at the creation step where it's fixed
    issues: z.array(issue).max(8).default([]),
  })
  .refine((b) => b.decision === "approved" || b.note || b.issues.length > 0, {
    message: "Tell the creator why, or list what to fix.",
    path: ["note"],
  });

export const analyticsQuery = z.object({
  // "all" = since the first activity on the platform
  days: z
    .enum(["7", "30", "90", "all"], "Use 7, 30, 90 or all.")
    .default("30")
    .transform((d) => (d === "all" ? null : Number(d))),
});

export type AdminTab = (typeof adminTabs)[number];
export type ReviewBody = z.infer<typeof reviewBody>;
