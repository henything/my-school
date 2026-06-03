import { describe, expect, it } from "vitest";
import { createUserSchema, updateUserStatusSchema } from "./schemas";

describe("user schemas", () => {
  it("accepts ADMIN and COACH creation payloads", () => {
    expect(
      createUserSchema.parse({
        login: "coach_1",
        password: "StrongPass123!",
        displayName: "Coach One",
        role: "COACH"
      })
    ).toMatchObject({ login: "coach_1", role: "COACH" });

    expect(
      createUserSchema.parse({
        login: "admin_1",
        password: "StrongPass123!",
        displayName: "Admin One",
        role: "ADMIN"
      })
    ).toMatchObject({ login: "admin_1", role: "ADMIN" });
  });

  it("rejects unsupported roles and statuses", () => {
    expect(() =>
      createUserSchema.parse({
        login: "owner_2",
        password: "StrongPass123!",
        displayName: "Owner Two",
        role: "SUPER_ADMIN"
      })
    ).toThrow();

    expect(() => updateUserStatusSchema.parse({ status: "DELETED" })).toThrow();
  });
});
