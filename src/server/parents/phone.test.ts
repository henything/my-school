import { describe, expect, it } from "vitest";
import { normalizeParentPhone, tryNormalizeParentPhone } from "./phone";

describe("parent phone normalization", () => {
  it("normalizes Russian phone formats to a login-safe value", () => {
    expect(normalizeParentPhone("+7 (999) 123-45-67")).toBe("79991234567");
    expect(normalizeParentPhone("8 999 123 45 67")).toBe("79991234567");
    expect(normalizeParentPhone("9991234567")).toBe("79991234567");
  });

  it("rejects missing or too-short phones", () => {
    expect(() => normalizeParentPhone("")).toThrow();
    expect(() => normalizeParentPhone("123")).toThrow();
    expect(tryNormalizeParentPhone("123")).toBeNull();
  });
});
