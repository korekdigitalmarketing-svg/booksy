import { z } from "zod";

// Host-authored localized content: one entry per locale, e.g.
// {"en":"Consultation","fr":"Consultation"}. At least one entry is
// required — the dashboard form enforces that it's specifically the
// host's own default locale, since getLocalized falls back through it.
const LocalizedTextSchema = z.record(z.string(), z.string().trim()).refine(
  (obj) => Object.values(obj).some((v) => v.length > 0),
  { message: "At least one locale must have content" },
);

export const EventTypeSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only"),
  title: LocalizedTextSchema,
  description: z.record(z.string(), z.string().trim()).default({}),
  durationMin: z.number().int().min(5).max(480),
  slotIncrementMin: z.number().int().min(5).max(120).default(15),
  priceCents: z.number().int().min(0),
  currency: z.string().trim().length(3),
  locationKind: z.enum(["video", "phone", "in_person", "custom"]),
  locationValue: z.string().trim().max(500).optional(),
  bufferBeforeMin: z.number().int().min(0).max(240),
  bufferAfterMin: z.number().int().min(0).max(240),
  minNoticeMin: z.number().int().min(0).max(10080),
  maxDaysAhead: z.number().int().min(1).max(365),
  maxPerDay: z.number().int().min(1).max(100).nullable().optional(),
  isActive: z.boolean(),
  // Enforced server-side too, not just a disabled submit button — the
  // acceptable-use commitment from section 11's terms page ("a required
  // checkbox + inline warning on the add-a-service form").
  policyAccepted: z.literal(true, {
    message: "You must confirm this service complies with the acceptable use policy",
  }),
});

export type EventTypeInput = z.infer<typeof EventTypeSchema>;
