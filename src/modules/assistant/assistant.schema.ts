import { z } from "zod";

/** Where the user is and what's on screen, sent with every turn. */
export const turnContext = z.object({
  // Current route, e.g. "/explore" or "/campaign/school-water"
  screen: z.string().max(200).default("/"),
  // Present while the campaign editor is open: lets Sam fill it in and ask for what's missing
  editor: z
    .object({
      campaignId: z.string().max(64),
      step: z.number().int().min(1).max(5),
      fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      missing: z.array(z.string().max(120)).max(30),
      // What blocks the current step, and an image Sam is creating right now (cover/ad)
      stepMissing: z.array(z.string().max(120)).max(20).optional(),
      creatingImage: z.enum(["cover", "ad"]).nullish(),
    })
    .nullish(),
  // The last few exchanges, so follow-ups like "open it" make sense
  history: z
    .array(z.object({ role: z.enum(["user", "sam"]), text: z.string().max(600) }))
    .max(10)
    .default([]),
});

export const turnBody = z.object({
  text: z.string().trim().max(1000).optional(),
  context: turnContext.default({ screen: "/", history: [] }),
});

export const speakBody = z.object({ text: z.string().trim().min(1).max(500) });

export type TurnContext = z.infer<typeof turnContext>;
