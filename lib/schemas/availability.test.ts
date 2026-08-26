import { describe, expect, it } from "vitest";
import { AvailabilityRulesSchema } from "./availability";

describe("AvailabilityRulesSchema", () => {
  it("rejects overlapping windows on the same weekday", () => {
    const result = AvailabilityRulesSchema.safeParse({
      rules: [
        { weekday: 1, startTime: "09:00", endTime: "12:00" },
        { weekday: 1, startTime: "11:30", endTime: "14:00" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("allows adjacent windows and the same hours on different weekdays", () => {
    const result = AvailabilityRulesSchema.safeParse({
      rules: [
        { weekday: 1, startTime: "09:00", endTime: "12:00" },
        { weekday: 1, startTime: "12:00", endTime: "14:00" },
        { weekday: 2, startTime: "09:00", endTime: "12:00" },
      ],
    });

    expect(result.success).toBe(true);
  });
});
