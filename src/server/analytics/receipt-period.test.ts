import { describe, expect, it } from "vitest";
import { reconcileReceipts, resolveReceiptPeriod, yookassaIncomeKopeks } from "./receipt-period";

describe("receipt period and YooKassa reconciliation", () => {
  it("uses the current Moscow month and inclusive calendar dates", () => {
    const period = resolveReceiptPeriod({}, new Date("2026-10-22T22:30:00Z"));
    expect(period.from).toBe("2026-10-01");
    expect(period.to).toBe("2026-10-23");
    expect(period.start.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(period.endExclusive.toISOString()).toBe("2026-10-23T21:00:00.000Z");
  });

  it("rejects malformed dates and preserves a chosen valid range", () => {
    expect(resolveReceiptPeriod({ from: "2026-09-01", to: "2026-09-30" }).to).toBe("2026-09-30");
    expect(resolveReceiptPeriod({ from: "2026-02-30" }, new Date("2026-10-10T12:00:00Z")).from).toBe("2026-10-01");
  });

  it("uses actual net amounts for multiple provider fees and includes manual payments", () => {
    const payments = [
      { amountKopeks: 360000, provider: "YOOKASSA", providerPaymentId: "card" },
      { amountKopeks: 45000, provider: "YOOKASSA", providerPaymentId: "sbp" },
      { amountKopeks: 90000, provider: "MANUAL", providerPaymentId: null }
    ];
    const income = new Map([["card", 344700], ["sbp", 44600]]);
    expect(reconcileReceipts(payments, income)).toEqual({
      grossKopeks: 495000, feeKopeks: 15700, netKopeks: 479300, unknownFeeCount: 0
    });
  });

  it("does not invent a fee or net amount when provider data is unavailable", () => {
    expect(reconcileReceipts([{ amountKopeks: 5000, provider: "YOOKASSA", providerPaymentId: "missing" }], new Map()))
      .toEqual({ grossKopeks: 5000, feeKopeks: null, netKopeks: null, unknownFeeCount: 1 });
  });

  it("parses the webhook income in exact kopeks", () => {
    expect(yookassaIncomeKopeks({ object: { income_amount: { value: "3447.00" } } })).toBe(344700);
    expect(yookassaIncomeKopeks({ object: { income_amount: { value: "invalid" } } })).toBeNull();
  });
});
