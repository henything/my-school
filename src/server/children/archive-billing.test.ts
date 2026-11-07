import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ audit: vi.fn(), task: vi.fn() }));
vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/server/tasks/task-service", () => ({ createTaskIfNotExists: mocks.task }));
import { archiveChildBilling } from "./archive-billing";
const admin = { id: "admin", schoolId: "school", role: "ADMIN", login: "admin", displayName: "Admin" } as const;
const bill = (id: string, status = "ISSUED") => ({ id, number: id, status, subscriptionId: null as string | null, amountKopeks: 360000, paidAmountKopeks: 0, payments: [] as { status: string }[], attempts: [] as { status: string }[], billingAdjustmentApplications: [] as { id: string }[] });
function fixture(invoices: ReturnType<typeof bill>[]) {
  const tx = { $queryRaw: vi.fn(), invoice: {
    findMany: vi.fn(async () => invoices.filter(i => i.status !== "CANCELLED")),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(invoices.find(i => i.id === where.id)!, data))
  }, lessonBalanceTransaction: { findFirst: async ({ where }: { where: { subscriptionId: string } }) => where.subscriptionId === "makeup-sub" ? { id: "used-makeup" } : null }, user: { findFirst: vi.fn(async () => ({ id: "assigned-admin" })) } };
  return { tx, client: tx as unknown as Prisma.TransactionClient };
}
beforeEach(() => vi.clearAllMocks());
describe("archive financial decisions", () => {
  it("cancels draft, issued and overdue invoices without erasing amounts; repeats are harmless", async () => {
    const rows = [bill("draft", "DRAFT"), bill("issued"), bill("late", "OVERDUE"), bill("failed")];
    rows[3].attempts = [{ status: "FAILED" }];
    const { tx, client } = fixture(rows);
    expect((await archiveChildBilling(client, admin, { id: "child", fullName: "Ребёнок" }, "Ушёл")).cancelledInvoiceIds).toHaveLength(4);
    expect(rows.every(i => i.status === "CANCELLED" && i.amountKopeks === 360000)).toBe(true);
    expect(mocks.task).not.toHaveBeenCalled();
    expect(tx.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "school", childId: "child", status: { not: "CANCELLED" } } }));
    await archiveChildBilling(client, admin, { id: "child", fullName: "Ребёнок" }, "Повтор");
    expect(tx.invoice.update).toHaveBeenCalledTimes(4);
  });
  it("preserves cash, partial, zero paid credits and unsettled provider operations; creates one admin task", async () => {
    const rows = [bill("paid", "PAID"), bill("partial", "PARTIALLY_PAID"), bill("pending"), bill("credit"), bill("provider"), bill("refunded"), bill("confirmed-attempt"), bill("makeup")];
    rows[0].paidAmountKopeks = 360000; rows[1].paidAmountKopeks = 45000;
    rows[2].attempts = [{ status: "CREATED" }]; rows[3].billingAdjustmentApplications = [{ id: "application" }];
    rows[4].payments = [{ status: "PENDING" }]; rows[5].payments = [{ status: "REFUNDED" }];
    rows[6].attempts = [{ status: "SUCCEEDED" }];
    rows[7].subscriptionId = "makeup-sub";
    const snapshot = structuredClone(rows);
    const { tx, client } = fixture(rows);
    expect((await archiveChildBilling(client, admin, { id: "child", fullName: "Ребёнок" }, "Ушёл")).reviewInvoiceCount).toBe(8);
    expect(rows).toEqual(snapshot); expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(mocks.task).toHaveBeenCalledOnce();
    expect(mocks.task).toHaveBeenCalledWith(client, expect.objectContaining({ relatedEntityType: "ChildArchiveBilling", childId: "child", assigneeUserId: "assigned-admin" }));
  });
  it("denies coaches and parents before reading financial data", async () => {
    const { tx, client } = fixture([]);
    for (const role of ["COACH", "PARENT"] as const) await expect(archiveChildBilling(client, { ...admin, role }, { id: "child", fullName: "X" }, "X")).rejects.toThrow();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
