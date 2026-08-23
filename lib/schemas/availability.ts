import { z } from "zod";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const AvailabilityRulesSchema = z.object({
  rules: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startTime: z.string().regex(TIME_RE, "Use HH:mm"),
          endTime: z.string().regex(TIME_RE, "Use HH:mm"),
        })
        .refine((r) => r.endTime > r.startTime, { message: "End time must be after start time" }),
    )
    .max(100),
});

export const DateOverrideSchema = z
  .object({
    theDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isClosed: z.boolean(),
    startTime: z.string().regex(TIME_RE).optional(),
    endTime: z.string().regex(TIME_RE).optional(),
  })
  .refine((o) => o.isClosed || (o.startTime && o.endTime && o.endTime > o.startTime), {
    message: "An open override needs a start and end time, with end after start",
  });
