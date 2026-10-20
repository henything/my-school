import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { applyAvailableCreditsToInvoice } from "./billing-adjustment-service";

describe("quarantine credit carryover", () => {
  it("pays the next invoice and keeps the unused credit for the following month", async () => {
    const invoices = new Map([
      ["november", { id: "november", schoolId: "school", childId: "child", parentId: "parent", subscriptionId: "nov-sub",
        periodStart: new Date("2026-11-01T00:00:00.000Z"), status: "ISSUED", amountKopeks: 90000,
        paidAmountKopeks: 0, attempts: [], payments: [] }],
      ["december", { id: "december", schoolId: "school", childId: "child", parentId: "parent", subscriptionId: "dec-sub",
        periodStart: new Date("2026-12-01T00:00:00.000Z"), status: "ISSUED", amountKopeks: 135000,
        paidAmountKopeks: 0, attempts: [], payments: [] }]
    ]);
    const credit = { id: "credit", schoolId: "school", childId: "child", parentId: "parent",
      kind: "CREDIT", amountKopeks: 180000, appliedAmountKopeks: 0 };
    const applications: Array<{ adjustmentId: string; invoiceId: string; amountKopeks: number }> = [];
    const tx = {
      $queryRaw: async () => [],
      invoice: {
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => invoices.get(where.id)!,
        update: async ({ where, data }: { where: { id: string }; data: { amountKopeks: number; status?: string } }) =>
          Object.assign(invoices.get(where.id)!, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)))
      },
      billingAdjustment: {
        findMany: async () => [credit],
        findUniqueOrThrow: async () => credit,
        update: async ({ data }: { data: { appliedAmountKopeks: { increment: number } } }) => {
          credit.appliedAmountKopeks += data.appliedAmountKopeks.increment;
        }
      },
      billingAdjustmentApplication: { create: async ({ data }: { data: typeof applications[number] }) => applications.push(data) },
      subscription: { update: async () => ({}) }
    } as unknown as Prisma.TransactionClient;

    expect(await applyAvailableCreditsToInvoice(tx, "november")).toBe(90000);
    expect(invoices.get("november")).toMatchObject({ amountKopeks: 0, status: "PAID" });
    expect(credit.appliedAmountKopeks).toBe(90000);
    expect(await applyAvailableCreditsToInvoice(tx, "december")).toBe(90000);
    expect(invoices.get("december")).toMatchObject({ amountKopeks: 45000, status: "ISSUED" });
    expect(credit.appliedAmountKopeks).toBe(180000);
    expect(applications).toEqual([
      { adjustmentId: "credit", invoiceId: "november", amountKopeks: 90000 },
      { adjustmentId: "credit", invoiceId: "december", amountKopeks: 90000 }
    ]);
  });
});
