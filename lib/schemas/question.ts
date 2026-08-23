import { z } from "zod";

// Same shape as event-type.ts's LocalizedTextSchema — at least one locale
// must have content, since getLocalized falls back through the host's
// default locale.
const LocalizedTextSchema = z.record(z.string(), z.string().trim()).refine(
  (obj) => Object.values(obj).some((v) => v.length > 0),
  { message: "At least one locale must have content" },
);

export const QuestionSchema = z
  .object({
    label: LocalizedTextSchema,
    questionType: z.enum(["text", "select"]),
    // Only read when questionType is "select" — validated below so a
    // select question can't be saved with zero choices to pick from.
    options: z.array(z.string().trim().min(1)).max(20).default([]),
    isRequired: z.boolean().default(false),
    sortOrder: z.number().int().min(0).default(0),
  })
  .refine((val) => val.questionType !== "select" || val.options.length >= 2, {
    message: "Select questions need at least two options",
    path: ["options"],
  });

export type QuestionInput = z.infer<typeof QuestionSchema>;
