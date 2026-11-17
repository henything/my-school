import { describe, expect, it } from "vitest";
import { adjustedInvoiceAmount, correctionInputSchema, correctionInvoiceBlockReason, rublesSchema } from "./manual-correction-rules";
import { calculateCreditAwareRecalculation } from "./recalculation";
const childId = "00000000-0000-4000-8000-000000000001";
describe("manual correction boundaries and money", () => {
  it("accepts exact rubles and rejects fractions below a kopek and invalid amounts", () => {
    expect(rublesSchema.parse("2,50")).toBe(250);
    expect(rublesSchema.parse("2250.01")).toBe(225001);
    for (const input of ["-1", "1.001", "NaN", "Infinity", "1e6", "2 250", "999999999999999", ""]) expect(rublesSchema.safeParse(input).success).toBe(false);
  });
  it("rejects ruble values in the lessons field on the server", () => {
    for (const quantity of [0, -1, 1.5, 32, 2250, 3000]) expect(correctionInputSchema.safeParse({ kind: "LESSON_BALANCE", childId, direction: "ADD", quantity, reason: "Причина" }).success).toBe(false);
    expect(correctionInputSchema.safeParse({ kind: "LESSON_BALANCE", childId, direction: "SUBTRACT", quantity: 31, reason: "Причина" }).success).toBe(true);
  });
  it("preserves the concession after a schedule reduction without discounting it twice", () => {
    expect(adjustedInvoiceAmount(405000, -180000, 0)).toBe(225000);
    expect(adjustedInvoiceAmount(360000, -180000, 0)).toBe(180000);
    expect(adjustedInvoiceAmount(324000, -180000, 45000)).toBe(99000);
    expect(adjustedInvoiceAmount(45000, -180000, 45000)).toBe(0);
  });
  it("caps future compensation at cash plus existing credits and deducts previous compensation", () => {
    const input = { invoiceBeforeCreditsKopeks: 360000, baseInvoiceKopeks: 360000, manualAdjustmentKopeks: -180000, appliedCreditKopeks: 0, paidAmountKopeks: 225000, existingAdjustmentsKopeks: 0 };
    expect(calculateCreditAwareRecalculation(input)).toMatchObject({ nextInvoiceAmountKopeks: 180000, additionalCreditKopeks: 45000, nextDiscountAmountKopeks: 0 });
    expect(calculateCreditAwareRecalculation({ ...input, existingAdjustmentsKopeks: 45000 }).additionalCreditKopeks).toBe(0);
  });
  it("retains unused credit without turning an unused concession into a refund", () => {
    expect(calculateCreditAwareRecalculation({ invoiceBeforeCreditsKopeks: 90000, baseInvoiceKopeks: 90000, manualAdjustmentKopeks: -180000, appliedCreditKopeks: 45000, paidAmountKopeks: 0, existingAdjustmentsKopeks: 0 })).toMatchObject({ nextInvoiceAmountKopeks: 0, additionalCreditKopeks: 45000 });
  });
  it("refuses paid, partially paid, canceled or previously attempted invoices", () => {
    const invoice = { status: "ISSUED", paidAmountKopeks: 0, payments: [], attempts: [] };
    expect(correctionInvoiceBlockReason(invoice)).toBe(null);
    for (const status of ["PAID", "PARTIALLY_PAID", "PAYMENT_PENDING", "CANCELLED"]) expect(correctionInvoiceBlockReason({ ...invoice, status })).not.toBe(null);
    expect(correctionInvoiceBlockReason({ ...invoice, attempts: [{ status: "CANCELED" }] })).not.toBe(null);
    expect(correctionInvoiceBlockReason({ ...invoice, paidAmountKopeks: 1 })).not.toBe(null);
    expect(correctionInvoiceBlockReason({ ...invoice, payments: [{}] })).not.toBe(null);
  });
});
