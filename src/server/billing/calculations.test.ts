import { describe, expect, it } from "vitest";
import {
  admissionStatusAfterLessonBalance,
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
