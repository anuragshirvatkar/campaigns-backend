import { z } from "zod";

export const updateMeBody = z
  .object({
    fullName: z.string().trim().min(1).max(80),
    avatarUrl: z.url().nullable(),
  })
  .partial();

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Use at least 8 characters.").max(72),
});
