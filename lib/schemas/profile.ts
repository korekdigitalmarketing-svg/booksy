import { z } from "zod";

export const ProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only"),
  timezone: z.string().min(1),
  locale: z.enum(["en", "fr", "es"]),
});
