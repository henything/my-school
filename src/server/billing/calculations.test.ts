import { describe, expect, it } from "vitest";
import {
  admissionStatusAfterLessonBalance,
  calculateBillableLessons,
  calculateSubscriptionInvoiceAmount,
  calculateSubscriptionTotal,
  canUseCreditLesson,
  DEFAULT_LESSON_PRICE_KOPEKS
} from "./calculations";

describe("billing calculations", () => {
  it("uses 450 RUB as the default lesson price", () => {
    expect(DEFAULT_LESSON_PRICE_KOPEKS).toBe(45000);
    expect(calculateSubscriptionTotal(8)).toBe(360000);
  });

  it("calculates mid-period totals from remaining lessons", () => {
    expect(calculateSubscriptionTotal(3, 45000)).toBe(135000);
    expect(calculateSubscriptionTotal(5, 50000)).toBe(250000);
  });

  it("reduces future invoices by available makeup credits", () => {
    expect(calculateBillableLessons(8, 2)).toBe(6);
    expect(calculateSubscriptionTotal(8, 45000, 2)).toBe(270000);
    expect(calculateSubscriptionInvoiceAmount(360000, 8, 2)).toBe(270000);
  });

  it("does not let makeup credits make an invoice negative", () => {
    expect(calculateBillableLessons(2, 5)).toBe(0);
    expect(calculateSubscriptionTotal(2, 45000, 5)).toBe(0);
    expect(calculateSubscriptionInvoiceAmount(360000, 2, 5)).toBe(0);
  });

  it("allows one credit lesson only from zero balance and admitted status", () => {
    expect(canUseCreditLesson(0, "ADMITTED")).toBe(true);
    expect(canUseCreditLesson(-1, "CREDIT_LESSON_USED")).toBe(false);
    expect(canUseCreditLesson(0, "NOT_ADMITTED")).toBe(false);
  });

  it("restores admission when lesson balance returns to zero or above", () => {
    expect(admissionStatusAfterLessonBalance(0, "CREDIT_LESSON_USED")).toBe("ADMITTED");
    expect(admissionStatusAfterLessonBalance(2, "NOT_ADMITTED")).toBe("ADMITTED");
    expect(admissionStatusAfterLessonBalance(-1, "ADMITTED")).toBe("CREDIT_LESSON_USED");
  });
});
