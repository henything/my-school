import { describe, expect, it } from "vitest";
import { createInvoiceSchema, createSubscriptionSchema, manualBalanceAdjustmentSchema, markInvoicePaidSchema, updatePaymentStatusSchema } from "./schemas";

const childId = "11111111-1111-4111-8111-111111111111";

describe("billing schemas", () => {
  it("accepts subscription monthly amount in rubles", () => {
    const input = createSubscriptionSchema.parse({
      childId,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      plannedLessonsCount: 8,
      totalAmountRub: 3600
    });

    expect(input.totalAmountKopeks).toBe(360000);
    expect(input.lessonPriceKopeks).toBe(45000);
  });

  it("rejects subscription periods where end is before start", () => {
    const result = createSubscriptionSchema.safeParse({
      childId,
      periodStart: "2026-06-30",
      periodEnd: "2026-06-01",
      plannedLessonsCount: 8
    });

    expect(result.success).toBe(false);
  });

  it("requires a payment status comment", () => {
    expect(updatePaymentStatusSchema.safeParse({ status: "PAID", comment: "Оплачено наличными" }).success).toBe(true);
    expect(updatePaymentStatusSchema.safeParse({ status: "PAID", comment: " " }).success).toBe(false);
  });

  it("requires manual adjustment comment and non-zero amount", () => {
    expect(manualBalanceAdjustmentSchema.safeParse({ amount: 2, comment: "Перенос остатка" }).success).toBe(true);
    expect(manualBalanceAdjustmentSchema.safeParse({ amount: 0, comment: "Перенос остатка" }).success).toBe(false);
    expect(manualBalanceAdjustmentSchema.safeParse({ amount: 1, comment: "" }).success).toBe(false);
  });

  it("validates invoice creation and manual payment comments", () => {
    expect(createInvoiceSchema.safeParse({ subscriptionId: childId, dueDate: "2026-07-10" }).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ subscriptionId: childId, dueDate: "10.07.2026" }).success).toBe(false);
    expect(markInvoicePaidSchema.safeParse({ comment: "Оплата по переводу" }).success).toBe(true);
    expect(markInvoicePaidSchema.safeParse({ amountKopeks: 0, comment: "Оплата" }).success).toBe(false);
    expect(markInvoicePaidSchema.safeParse({ amountKopeks: 1000, comment: "" }).success).toBe(false);
  });
});
