import { describe, expect, it } from "vitest";
import { createCoachSchema, updateCoachSchema } from "./schemas";

describe("coach schemas", () => {
  it("keeps phone numbers in the strict public format", () => {
    expect(
      createCoachSchema.parse({
        login: "coach_1",
        password: "StrongPass123!",
        displayName: "Coach One",
        phone: "+79991234567"
      }).phone
    ).toBe("+79991234567");

    expect(createCoachSchema.safeParse({ login: "coach_1", password: "StrongPass123!", displayName: "Coach One", phone: "89991234567" }).success).toBe(
      false
    );
  });

  it("does not clear phone when update omits it", () => {
    expect(updateCoachSchema.parse({ notes: "ok" })).not.toHaveProperty("phone");
    expect(updateCoachSchema.parse({ phone: "" }).phone).toBeNull();
  });
});
