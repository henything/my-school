import { describe, expect, it } from "vitest";
import {
  buildYooKassaPaymentPayload,
  formatKopeksForYooKassa,
  parseYooKassaAmountKopeks,
  yookassaWebhookEventId,
  YOOKASSA_RECEIPT_DESCRIPTION
} from "./yookassa";

describe("YooKassa helpers", () => {
  it("formats kopeks for YooKassa amount values", () => {
    expect(formatKopeksForYooKassa(450000)).toBe("4500.00");
    expect(formatKopeksForYooKassa(123456)).toBe("1234.56");
    expect(() => formatKopeksForYooKassa(0)).toThrow();
  });

  it("parses YooKassa amount values back to kopeks", () => {
    expect(parseYooKassaAmountKopeks("4500.00")).toBe(450000);
    expect(parseYooKassaAmountKopeks("99.9")).toBe(9990);
    expect(() => parseYooKassaAmountKopeks("99.999")).toThrow();
  });

  it("builds payment payload with receipt settings confirmed by accountant", () => {
    const payload = buildYooKassaPaymentPayload({
      shopId: "1429068",
      secretKey: "test_secret",
      idempotenceKey: "attempt-id",
      amountKopeks: 450000,
      invoiceId: "invoice-id",
      invoiceNumber: "Иванова Мария 24/08/2026",
      schoolId: "school-id",
      parentId: "parent-id",
      childId: "child-id",
      customerPhone: "79991234567",
      returnUrl: "https://azbukadvizheniya.ru/parent/payments?invoice=invoice-id"
    });

    expect(payload.amount.value).toBe("4500.00");
    expect(payload.capture).toBe(true);
    expect(payload.receipt.tax_system_code).toBe(6);
    expect(payload.receipt.customer.phone).toBe("79991234567");
    expect(payload.receipt.items[0]).toMatchObject({
      description: YOOKASSA_RECEIPT_DESCRIPTION,
      vat_code: 1,
      quantity: "1.00",
      measure: "another",
      payment_subject: "service",
      payment_mode: "full_payment"
    });
    expect(payload.metadata).toMatchObject({
      invoiceId: "invoice-id",
      schoolId: "school-id",
      parentId: "parent-id",
      childId: "child-id"
    });
  });

  it("derives stable webhook event ids", () => {
    expect(yookassaWebhookEventId("payment.succeeded", "payment-id", "succeeded")).toBe("payment.succeeded:payment-id:succeeded");
  });
});
