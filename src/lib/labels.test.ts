import { describe, expect, it } from "vitest";
import { labelForEnum, labelsForSearch } from "./labels";

describe("enum labels", () => {
  it("maps user-facing enum values to Russian labels", () => {
    expect(labelForEnum("ACTIVE")).toBe("Активен");
    expect(labelForEnum("NOT_ADMITTED")).toBe("Недопуск");
    expect(labelForEnum("ATTENDANCE_NOT_FILLED")).toBe("Не заполнен табель");
  });

  it("keeps unknown values visible for diagnostics", () => {
    expect(labelForEnum("NEW_STATUS")).toBe("NEW_STATUS");
  });

  it("includes raw and localized values in search text", () => {
    expect(labelsForSearch("NOT_PAID", "OVERDUE")).toContain("Не оплачен");
    expect(labelsForSearch("NOT_PAID", "OVERDUE")).toContain("NOT_PAID");
  });
});
