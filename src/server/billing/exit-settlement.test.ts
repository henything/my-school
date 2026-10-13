import { describe, expect, it } from "vitest";
import { calculateExitPeriod } from "./exit-settlement";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("exit settlement preview", () => {
  const attendance = [
    { lessonId: "one", lessonDate: date("2026-10-01"), status: "PRESENT", isMakeup: false },
    { lessonId: "two", lessonDate: date("2026-10-06"), status: "PRESENT", isMakeup: false },
    { lessonId: "three", lessonDate: date("2026-10-08"), status: "ABSENT_UNEXCUSED", isMakeup: false },
    { lessonId: "four", lessonDate: date("2026-10-13"), status: "PRESENT", isMakeup: true },
    { lessonId: "five", lessonDate: date("2026-10-15"), status: "ABSENT_SICK_PENDING", isMakeup: false }
  ];

  it("counts visits and unexcused absences but does not charge a used makeup or sickness", () => {
    const result = calculateExitPeriod({
      periodStart: date("2026-10-01"),
      periodEnd: date("2026-10-31"),
      lessonPriceKopeks: 45000,
      attendance,
      paidAmountKopeks: 360000,
      invoiceAmountKopeks: 360000
    });
    expect(result.presentDates).toEqual(["2026-10-01", "2026-10-06", "2026-10-13"]);
    expect(result.chargedCount).toBe(3);
    expect(result.earnedAmountKopeks).toBe(135000);
    expect(result.potentialCreditKopeks).toBe(225000);
  });

  it("shows the amount due when no payment was made", () => {
    const result = calculateExitPeriod({
      periodStart: date("2026-10-01"),
      periodEnd: date("2026-10-31"),
      lessonPriceKopeks: 45000,
      attendance: attendance.slice(0, 2),
      paidAmountKopeks: 0,
      invoiceAmountKopeks: 360000
    });
    expect(result.potentialDebtKopeks).toBe(90000);
    expect(result.invoiceReductionKopeks).toBe(270000);
  });
});
