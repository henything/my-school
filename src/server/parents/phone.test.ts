import { describe, expect, it } from "vitest";
import { legacyPhoneLogin, normalizeParentPhone, phoneDigitsForProvider, tryNormalizeParentPhone } from "./phone";

describe("parent phone normalization", () => {
  it("normalizes Russian phone formats to one public value", () => {
    expect(normalizeParentPhone("+7 (999) 123-45-67")).toBe("+79991234567");
    expect(normalizeParentPhone("8 999 123 45 67")).toBe("+79991234567");
    expect(normalizeParentPhone("9991234567")).toBe("+79991234567");
    expect(phoneDigitsForProvider("+7 (999) 123-45-67")).toBe("79991234567");
    expect(legacyPhoneLogin("+7 (999) 123-45-67")).toBe("79991234567");
  });

  it("rejects missing, too-short or too-long phones", () => {
    expect(() => normalizeParentPhone("")).toThrow();
    expect(() => normalizeParentPhone("123")).toThrow();
    expect(() => normalizeParentPhone("+7 999 123-45-678")).toThrow();
    expect(tryNormalizeParentPhone("123")).toBeNull();
  });
});
