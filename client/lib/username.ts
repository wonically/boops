import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only")
  .transform((value) => value.toLowerCase());

export function parseUsername(value: unknown) {
  return usernameSchema.safeParse(value);
}
