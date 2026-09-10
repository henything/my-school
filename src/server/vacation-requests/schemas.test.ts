import { describe, expect, it } from "vitest";
import { createVacationRequestSchema, reviewVacationRequestSchema } from "./schemas";

describe("vacation request schemas", () => {
  it("accepts a valid vacation request upload payload", () => {
    const result = createVacationRequestSchema.parse({
      childId: "11111111-1111-4111-8111-111111111111",
      periodStart: "2026-09-15",
      periodEnd: "2026-09-20",
      comment: "Семейная поездка"
    });

    expect(result.periodStart).toEqual(new Date("2026-09-15T00:00:00.000Z"));
    expect(result.comment).toBe("Семейная поездка");
  });

  it("rejects vacation request with inverted dates", () => {
    expect(() =>
      createVacationRequestSchema.parse({
        childId: "11111111-1111-4111-8111-111111111111",
        periodStart: "2026-09-20",
        periodEnd: "2026-09-15"
      })
    ).toThrow("Дата окончания отпуска должна быть не раньше даты начала.");
  });

  it("requires admin comment when rejecting a vacation request", () => {
    expect(reviewVacationRequestSchema.safeParse({ status: "APPROVED" }).success).toBe(true);
    expect(reviewVacationRequestSchema.safeParse({ status: "REJECTED", adminComment: "Нет заявления" }).success).toBe(true);
    expect(reviewVacationRequestSchema.safeParse({ status: "REJECTED" }).success).toBe(false);
  });
});
