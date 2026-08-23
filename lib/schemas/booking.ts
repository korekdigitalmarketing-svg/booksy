import { z } from "zod";

export const CreateBookingSchema = z.object({
  eventTypeId: z.string().uuid(),
  // The slot the client picked — a claim, not a fact. The server always
  // recomputes availability before trusting it (section 6).
  slot: z.string().datetime({ offset: true }),
  timezone: z.string().min(1),
  locale: z.enum(["en", "fr", "es"]),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
