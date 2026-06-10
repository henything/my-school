import { describe, expect, it } from "vitest";
import { createChildSchema, updateChildSchema } from "./schemas";

describe("child schemas", () => {
  it("accepts a child with one current group", () => {
    const child = createChildSchema.parse({
      fullName: "Иван Петров",
      currentGroupId: "11111111-1111-4111-8111-111111111111",
      status: "ACTIVE",
      admissionStatus: "ADMITTED"
    });

    expect(child.currentGroupId).toBe("11111111-1111-4111-8111-111111111111");
    expect(child.status).toBe("ACTIVE");
  });

  it("rejects unsupported child statuses", () => {
    expect(() =>
      updateChildSchema.parse({
        status: "DELETED"
      })
    ).toThrow();
  });

  it("does not clear birth date when patch input omits it", () => {
    const patch = updateChildSchema.parse({
      currentGroupId: "11111111-1111-4111-8111-111111111111"
    });

    expect(patch).not.toHaveProperty("birthDate");
  });
});
