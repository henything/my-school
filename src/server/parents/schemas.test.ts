import { describe, expect, it } from "vitest";
import { activateParentInviteSchema, confirmParentPasswordResetSchema, createParentSchema } from "./schemas";

describe("parent schemas", () => {
  it("accepts parent contact data without auth fields", () => {
    const parent = createParentSchema.parse({
      fullName: "Анна Петрова",
      phone: "8 900 000-00-00",
      vkProfileUrl: "https://vk.com/example"
    });

    expect(parent.fullName).toBe("Анна Петрова");
    expect(parent.phone).toBe("8 900 000-00-00");
    expect(parent).not.toHaveProperty("login");
    expect(parent).not.toHaveProperty("password");
  });

  it("requires a phone", () => {
    expect(() => createParentSchema.parse({ fullName: "", phone: "" })).toThrow();
    expect(() => createParentSchema.parse({ fullName: "Анна Петрова", phone: "" })).toThrow();
  });

  it("requires parents to set a strong enough password from token links", () => {
    const token = "abcdefghijklmnopqrstuvwxyz123456";

    expect(activateParentInviteSchema.safeParse({ token, password: "StrongPass123!" }).success).toBe(true);
    expect(activateParentInviteSchema.safeParse({ token, password: "short" }).success).toBe(false);
    expect(confirmParentPasswordResetSchema.safeParse({ token, password: "StrongPass123!" }).success).toBe(true);
    expect(confirmParentPasswordResetSchema.safeParse({ token: "tiny", password: "StrongPass123!" }).success).toBe(false);
  });
});
