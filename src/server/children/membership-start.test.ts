import { describe, expect, it } from "vitest";
import { updateMembershipStartSchema } from "./membership-start";

describe("membership start correction", () => {
  it("requires a valid date and a reason for the audit trail", () => {
    expect(() => updateMembershipStartSchema.parse({ startDate: "2026-10-08", reason: "" })).toThrow();
    expect(() => updateMembershipStartSchema.parse({ startDate: "2026-02-30", reason: "Исправление" })).toThrow();
    const parsed = updateMembershipStartSchema.parse({ startDate: "2026-10-08", reason: " Уточнили дату " });
    expect(parsed.startDate.toISOString().slice(0, 10)).toBe("2026-10-08");
    expect(parsed.reason).toBe("Уточнили дату");
  });
});
