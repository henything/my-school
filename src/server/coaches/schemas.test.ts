import { describe, expect, it } from "vitest";
import { createCoachSchema, updateCoachSchema } from "./schemas";

describe("coach schemas", () => {
  it("accepts common phone number formatting", () => {
    expect(
      createCoachSchema.parse({
        login: "coach_1",
        password: "StrongPass123!",
        displayName: "Coach One",
        phone: "8 (999) 123-45-67"
      }).phone
    ).toBe("8 (999) 123-45-67");

    expect(createCoachSchema.safeParse({ login: "coach_1", password: "StrongPass123!", displayName: "Coach One", phone: "call me" }).success).toBe(
      false
    );
  });

  it("does not clear phone when update omits it", () => {
    expect(updateCoachSchema.parse({ notes: "ok" })).not.toHaveProperty("phone");
    expect(updateCoachSchema.parse({ phone: "" }).phone).toBeNull();
  });
});
