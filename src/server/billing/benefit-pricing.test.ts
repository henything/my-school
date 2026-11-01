import { describe, expect, it } from "vitest";
import { benefitPricing } from "./benefit-pricing";
import { BENEFIT_CATEGORIES } from "@/lib/benefits";
import { calculateRecalculatedAmounts } from "./recalculation";
const subscription = { plannedLessonsCount: 8, lessonPriceKopeks: 45000, totalAmountKopeks: 360000, baseLessonPriceKopeks: null, baseTotalAmountKopeks: null, discountPercent: 0, discountCategory: null };
describe("approved family benefit", () => {
  it.each(BENEFIT_CATEGORIES)("applies exactly 10 percent for %s", category => {
    expect(benefitPricing(subscription, { benefitStatus: "APPROVED", benefitCategory: category }, false, 0)).toMatchObject({ amountBeforeDiscountKopeks: 360000, amountKopeks: 324000, discountAmountKopeks: 36000, lessonPriceKopeks: 40500, discountPercent: 10 });
  });
  it.each(["NONE", "PENDING", "REJECTED"])("does not discount an unapproved request (%s)", benefitStatus => {
    expect(benefitPricing(subscription, { benefitStatus, benefitCategory: "LARGE_FAMILY" }, false, 0).amountKopeks).toBe(360000);
  });
  it("takes ten percent of a manually specified monthly total, rounded to kopeks", () => {
    const custom = { ...subscription, plannedLessonsCount: 3, lessonPriceKopeks: 33334, totalAmountKopeks: 100001 };
    expect(benefitPricing(custom, { benefitStatus: "APPROVED", benefitCategory: "LARGE_FAMILY" }, false, 0).amountKopeks).toBe(90001);
  });
  it("freezes history when approval or removal happens later", () => {
    const approved = { benefitStatus: "APPROVED", benefitCategory: "TWO_CHILDREN" } as const;
    expect(benefitPricing(subscription, approved, true, 0).amountKopeks).toBe(360000);
    const priced = benefitPricing(subscription, approved, false, 0);
    expect(benefitPricing({ ...subscription, ...priced }, { benefitStatus: "NONE", benefitCategory: null }, true, 0).amountKopeks).toBe(324000);
  });
  it("does not compound the discount on later months or repeat calculation", () => {
    const parent = { benefitStatus: "APPROVED", benefitCategory: "TWO_CHILDREN" } as const;
    const first = benefitPricing(subscription, parent, false, 0);
    const next = { ...subscription, lessonPriceKopeks: first.baseLessonPriceKopeks };
    expect(benefitPricing(next, parent, false, 0).amountKopeks).toBe(324000);
    expect(benefitPricing({ ...subscription, ...first }, parent, false, 0).amountKopeks).toBe(324000);
    expect(benefitPricing(next, { benefitStatus: "NONE", benefitCategory: null }, false, 0).amountKopeks).toBe(360000);
  });
  it("gives both siblings the same approved price", () => {
    const parent = { benefitStatus: "APPROVED", benefitCategory: "TWO_CHILDREN" } as const;
    expect([1,2].map(() => benefitPricing(subscription, parent, false, 0).amountKopeks)).toEqual([324000, 324000]);
  });
  it("combines the benefit with three transferred lessons without applying ten percent twice", () => {
    expect(benefitPricing(subscription, { benefitStatus: "APPROVED", benefitCategory: "LARGE_FAMILY" }, false, 3)).toMatchObject({ amountBeforeDiscountKopeks: 225000, amountKopeks: 202500, discountAmountKopeks: 22500 });
  });
  it("uses the discounted rate for a paid quarantine adjustment", () => {
    const price = benefitPricing(subscription, { benefitStatus: "APPROVED", benefitCategory: "LARGE_FAMILY" }, false, 0);
    const next = calculateRecalculatedAmounts({ previousLessonsCount: 8, previousTotalKopeks: price.totalAmountKopeks, unitPriceKopeks: price.lessonPriceKopeks, nextLessonsCount: 4, appliedMakeupCount: 0 });
    expect(price.amountKopeks - next.nextInvoiceAmountKopeks).toBe(162000);
  });
});
