import { z } from "zod";

const email = z
  .email("Enter a valid email address.")
  .trim()
  .toLowerCase()
  .max(254);

const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters."); // bcrypt only reads the first 72 bytes

export const signupBody = z.object({
  email,
  password,
  fullName: z.string().trim().min(1, "Enter your name.").max(80),
});

export const loginBody = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordBody = z.object({ email });

export const resetPasswordBody = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
  newPassword: password,
});

export const googleBody = z.object({
  idToken: z.string().min(1).max(4096),
});

export type SignupBody = z.infer<typeof signupBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type GoogleBody = z.infer<typeof googleBody>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBody>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBody>;
