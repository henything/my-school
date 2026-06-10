import { describe, expect, it } from "vitest";
import { createParentSchema } from "./schemas";

describe("parent schemas", () => {
  it("accepts parent contact data without auth fields", () => {
    const parent = createParentSchema.parse({
      fullName: "Анна Петрова",
      phone: "+7 900 000-00-00",
      vkProfileUrl: "https://vk.com/example"
    });

    expect(parent.fullName).toBe("Анна Петрова");
    expect(parent.phone).toContain("900");
    expect(parent).not.toHaveProperty("login");
    expect(parent).not.toHaveProperty("password");
  });

  it("requires at least a name or phone", () => {
    expect(() => createParentSchema.parse({ fullName: "", phone: "" })).toThrow();
  });
});
