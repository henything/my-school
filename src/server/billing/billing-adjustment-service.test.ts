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
      billingAdjustmentApplication: { upsert: async ({ where, create, update }: {
        where: { adjustmentId_invoiceId: { adjustmentId: string; invoiceId: string } };
        create: typeof applications[number]; update: { amountKopeks: { increment: number } }
      }) => {
        const existing = applications.find((application) => application.adjustmentId === where.adjustmentId_invoiceId.adjustmentId && application.invoiceId === where.adjustmentId_invoiceId.invoiceId);
        if (existing) existing.amountKopeks += update.amountKopeks.increment;
        else applications.push(create);
      } },
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

  it("adds remaining credit to an existing application after a zero invoice is reopened", async () => {
    const invoice = { id: "november", schoolId: "school", childId: "child", parentId: "parent", subscriptionId: "nov-sub",
      periodStart: new Date("2026-11-01T00:00:00.000Z"), status: "ISSUED", amountKopeks: 180000,
      paidAmountKopeks: 0, attempts: [], payments: [] };
    // The original 1,800 rubles were retained by the schedule change. Another 1,800 remain available.
    const credit = { id: "september-credit", amountKopeks: 360000, appliedAmountKopeks: 180000 };
    const application = { id: "original-application", adjustmentId: credit.id, invoiceId: invoice.id, amountKopeks: 180000 };
    let applicationRows = 1;
    let incrementCalls = 0;
    const tx = {
      $queryRaw: async () => [],
      invoice: {
        findUniqueOrThrow: async () => invoice,
        update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(invoice, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)))
      },
      billingAdjustment: {
        findMany: async () => [credit], findUniqueOrThrow: async () => credit,
        update: async ({ data }: { data: { appliedAmountKopeks: { increment: number } } }) => {
          credit.appliedAmountKopeks += data.appliedAmountKopeks.increment;
        }
      },
      billingAdjustmentApplication: {
        upsert: async ({ where, create, update }: {
          where: { adjustmentId_invoiceId: { adjustmentId: string; invoiceId: string } };
          create: { adjustmentId: string; invoiceId: string; amountKopeks: number };
          update: { amountKopeks: { increment: number } }
        }) => {
          if (where.adjustmentId_invoiceId.adjustmentId === application.adjustmentId && where.adjustmentId_invoiceId.invoiceId === application.invoiceId) {
            application.amountKopeks += update.amountKopeks.increment;
            incrementCalls++;
          } else { applicationRows++; Object.assign(application, create); }
          return application;
        }
      },
      subscription: { update: async () => ({}) }
    } as unknown as Prisma.TransactionClient;

    expect(await applyAvailableCreditsToInvoice(tx, invoice.id)).toBe(180000);
    expect(invoice).toMatchObject({ amountKopeks: 0, status: "PAID", paidAmountKopeks: 0 });
    expect(credit).toMatchObject({ amountKopeks: 360000, appliedAmountKopeks: 360000 });
    expect(application).toEqual({ id: "original-application", adjustmentId: credit.id, invoiceId: invoice.id, amountKopeks: 360000 });
    expect(applicationRows).toBe(1);
    expect(incrementCalls).toBe(1);
    expect(await applyAvailableCreditsToInvoice(tx, invoice.id)).toBe(0);
    expect(application.amountKopeks).toBe(360000);
    expect(incrementCalls).toBe(1);
  });
});
