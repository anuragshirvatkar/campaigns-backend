import { z } from "zod";

export const postUpdateBody = z.object({
  title: z.string().trim().min(1, "Add a title.").max(120),
  body: z.string().trim().min(1, "Write the update.").max(5000),
});
