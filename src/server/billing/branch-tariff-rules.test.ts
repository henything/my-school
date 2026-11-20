import { describe, expect, it } from "vitest";
import { branchTariffInputSchema, monthDate, nextTariffMonth, priceForMonth } from "./branch-tariff-rules";
import { calculateSubscriptionTotal } from "./calculations";
import { createSubscriptionSchema } from "./schemas";

describe("branch tariff rules", () => {
  const tariffs = [{ effectiveMonth: monthDate("2027-01"), lessonPriceKopeks: 37500 }, { effectiveMonth: monthDate("2027-03"), lessonPriceKopeks: 45000 }];
  it.each([["2026-12", 45000], ["2027-01", 37500], ["2027-02", 37500], ["2027-03", 45000]])("resolves %s including default and return to standard", (month, price) => {
    expect(priceForMonth(tariffs, monthDate(month)).lessonPriceKopeks).toBe(price);
  });
  it.each([[3, 45000, 135000], [8, 45000, 360000], [9, 45000, 405000], [3, 37500, 112500], [8, 37500, 300000], [9, 37500, 337500]])("counts %i lessons at %i kopeks", (count, unit, total) => {
    expect(calculateSubscriptionTotal(count, unit)).toBe(total);
  });
  it.each(["2026-00", "2026-13", "26-01", "2026-1"])("rejects invalid month %s", month => {
    expect(() => monthDate(month)).toThrow();
  });
  it("rejects unsupported prices and missing/concurrent versions", () => {
    expect(branchTariffInputSchema.safeParse({ lessonPriceKopeks: 30000, expectedVersion: 0 }).success).toBe(false);
    expect(branchTariffInputSchema.safeParse({ lessonPriceKopeks: 37500, expectedVersion: -1 }).success).toBe(false);
  });
  it("automatically chooses the next month including December rollover", () => {
    expect(nextTariffMonth(new Date("2026-11-20"))).toBe("2026-12");
    expect(nextTariffMonth(new Date("2026-12-31"))).toBe("2027-01");
    expect(branchTariffInputSchema.safeParse({ effectiveMonth: "2026-11", lessonPriceKopeks: 37500, expectedVersion: 0 }).success).toBe(false);
  });
  it("distinguishes omitted prices from legacy explicit prices and enforces new manual reason", () => {
    const base = { childId: "11111111-1111-4111-8111-111111111111", periodStart: "2027-01-01", periodEnd: "2027-01-31" };
    expect(createSubscriptionSchema.parse(base).lessonPriceKopeks).toBeUndefined();
    expect(createSubscriptionSchema.parse({ ...base, lessonPriceKopeks: 42000 }).lessonPriceKopeks).toBe(42000);
    expect(createSubscriptionSchema.safeParse({ ...base, pricingMode: "BRANCH_TARIFF", totalAmountRub: 3000 }).success).toBe(false);
    expect(createSubscriptionSchema.safeParse({ ...base, pricingMode: "MANUAL", totalAmountRub: 3000 }).success).toBe(false);
    expect(createSubscriptionSchema.parse({ ...base, pricingMode: "MANUAL", totalAmountRub: 3000, manualReason: "Исключение" }).totalAmountKopeks).toBe(300000);
  });
});
