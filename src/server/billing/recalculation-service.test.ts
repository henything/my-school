import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { applyRecalculationInTransaction, getRecalculationPreviewInTransaction } from "./recalculation-service";

vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: vi.fn(async () => ({})) }));
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const admin: CurrentUser = { id: "admin", schoolId: "school", login: "admin", displayName: "Admin", role: "ADMIN" };

function fixture(input: { previous: number; next: number; appliedCredit?: number; makeup?: number; discount?: boolean; paid?: boolean; cashPaid?: number; attempts?: number }) {
  const unit = input.discount ? 40500 : 45000;
  const applications = input.appliedCredit ? [{ id: "old-application", amountKopeks: input.appliedCredit }] : [];
  const invoice = {
    id: "invoice", parentId: "parent", number: "INV", updatedAt: date("2026-11-01"),
    createdAt: date("2026-11-01"), dueDate: date("2026-11-10"),
    amountKopeks: Math.max(0, (input.previous - (input.makeup ?? 0)) * unit - (input.appliedCredit ?? 0)),
    status: input.paid ? "PAID" : "ISSUED", paidAmountKopeks: input.cashPaid ?? 0,
    payments: input.cashPaid ? [{ id: "cash" }] : [],
    attempts: Array.from({ length: input.attempts ?? 0 }, (_, i) => ({ id: `attempt-${i}` })),
    billingAdjustmentApplications: applications
  };
  const lessons = Array.from({ length: input.next }, (_, i) => ({ id: `lesson-${i}`, groupId: "group", lessonDate: date(`2026-11-${String(i + 2).padStart(2, "0")}`) }));
  const subscription = {
    id: "sub", childId: "child", updatedAt: date("2026-11-01"), periodStart: date("2026-11-01"), periodEnd: date("2026-11-30"),
    plannedLessonsCount: input.previous, totalAmountKopeks: input.previous * unit,
    lessonPriceKopeks: unit, baseLessonPriceKopeks: 45000, discountPercent: input.discount ? 10 : 0,
    child: { id: "child", status: "ACTIVE", fullName: "Ребёнок", parentId: "parent", cachedLessonBalance: 20, admissionStatus: "ACTIVE",
      groupMemberships: [{ groupId: "group", startDate: date("2026-11-01"), endDate: null }], attendancePlans: [] },
    invoices: [invoice], lessonSnapshots: [] as Array<{ lessonId: string; lessonDate: Date }>,
    billingAdjustments: [] as Array<{ id: string; amountKopeks: number }>
  };
  const omitUndefined = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  const invoiceUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(invoice, omitUndefined(data)));
  const adjustmentCreate = vi.fn(async ({ data }: { data: { amountKopeks: number } }) => {
    subscription.billingAdjustments.push({ id: `new-${subscription.billingAdjustments.length}`, amountKopeks: data.amountKopeks });
    return data;
  });
  const tx = {
    $queryRaw: vi.fn(async () => []),
    subscription: {
      findFirstOrThrow: async () => subscription,
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(subscription, omitUndefined(data))
    },
    lesson: { findMany: async () => lessons }, attendanceRecord: { findMany: async () => [] }, trialParticipant: { findMany: async () => [] },
    lessonBalanceTransaction: { aggregate: async () => ({ _sum: { amount: -(input.makeup ?? 0) } }), create: vi.fn(async () => ({})) },
    invoice: { findUniqueOrThrow: async () => invoice, findMany: async () => [], update: invoiceUpdate },
    billingAdjustment: { create: adjustmentCreate },
    subscriptionLesson: {
      deleteMany: async () => { subscription.lessonSnapshots = []; },
      createMany: async ({ data }: { data: Array<{ lessonId: string; lessonDate: Date }> }) => { subscription.lessonSnapshots = data; }
    },
    child: { findFirstOrThrow: async () => subscription.child, update: async ({ data }: { data: { cachedLessonBalance: { increment: number } } }) => { subscription.child.cachedLessonBalance += data.cachedLessonBalance.increment; } }
  } as unknown as Prisma.TransactionClient;
  async function apply() {
    const preview = await getRecalculationPreviewInTransaction(tx, admin, "sub");
    return applyRecalculationInTransaction(tx, admin, "sub", {
      reason: "Новое расписание", paidDifferenceAction: "CREDIT", expectedLessonIds: preview.nextLessons.map((lesson) => lesson.id),
      expectedSubscriptionUpdatedAt: preview.subscriptionUpdatedAt, expectedInvoiceUpdatedAt: preview.invoiceUpdatedAt!
    });
  }
  return { tx, invoice, subscription, applications, invoiceUpdate, adjustmentCreate, apply };
}

describe("credit preserving invoice recalculation", () => {
  it("locks the child before subscription/invoice and refuses to revive archived invoices", async () => {
    const f = fixture({ previous: 9, next: 8 });
    await f.apply();
    const locks = vi.mocked(f.tx.$queryRaw).mock.calls.map(call => String(call[0]));
    expect(locks[0]).toContain("children");
    expect(locks[1]).toContain("subscriptions");
    expect(locks[2]).toContain("invoices");
    f.subscription.child.status = "ARCHIVED";
    await expect(f.apply()).rejects.toThrow("Ребёнок в архиве");
    expect(f.invoiceUpdate).toHaveBeenCalledTimes(1);
  });

  it("preserves the 450 ruble credit and does not count it as a family discount", async () => {
    const f = fixture({ previous: 9, next: 8, appliedCredit: 45000 });
    const preview = await getRecalculationPreviewInTransaction(f.tx, admin, "sub");
    expect(preview).toMatchObject({ canApply: true, appliedCreditKopeks: 45000, nextInvoiceAmountKopeks: 315000, nextDiscountAmountKopeks: 0 });
    await f.apply();
    expect(f.invoice).toMatchObject({ amountKopeks: 315000, discountAmountKopeks: 0 });
    expect(f.applications).toEqual([{ id: "old-application", amountKopeks: 45000 }]);
    expect(f.adjustmentCreate).not.toHaveBeenCalled();
  });

  it("combines the saved discounted price, makeup lessons and money credit", async () => {
    const f = fixture({ previous: 9, next: 8, appliedCredit: 45000, makeup: 1, discount: true });
    await f.apply();
    expect(f.invoice).toMatchObject({ amountBeforeDiscountKopeks: 315000, discountAmountKopeks: 31500, amountKopeks: 238500 });
    expect(f.subscription.totalAmountKopeks).toBe(324000);
  });

  it("reopens an invoice settled without cash when the schedule grows", async () => {
    const f = fixture({ previous: 4, next: 8, appliedCredit: 180000, paid: true });
    expect(await getRecalculationPreviewInTransaction(f.tx, admin, "sub")).toMatchObject({ canApply: true, creditSettledWithoutCash: true, nextInvoiceAmountKopeks: 180000 });
    await f.apply();
    expect(f.invoice).toMatchObject({ status: "ISSUED", amountKopeks: 180000, paidAmountKopeks: 0, paidAt: null });
    expect(f.subscription).toMatchObject({ paymentStatus: "INVOICED" });
    expect(f.applications[0].amountKopeks).toBe(180000);
  });

  it("carries unused applied credit forward exactly once when lessons decrease", async () => {
    const f = fixture({ previous: 4, next: 2, appliedCredit: 180000, paid: true });
    const next = await f.apply();
    expect(f.invoice).toMatchObject({ status: "PAID", amountKopeks: 0, paidAmountKopeks: 0 });
    expect(f.adjustmentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "CREDIT", amountKopeks: 90000, sourceInvoiceId: "invoice", sourceSubscriptionId: "sub" }) });
    expect(next).toMatchObject({ canApply: false, canApplyPaid: false, additionalCreditKopeks: 0 });
    await expect(f.apply()).rejects.toThrow("уже соответствуют");
    expect(f.adjustmentCreate).toHaveBeenCalledTimes(1);
  });

  it("creates a credit for a paid reduction without changing the cash invoice or payment", async () => {
    const f = fixture({ previous: 9, next: 8, appliedCredit: 45000, paid: true, cashPaid: 360000, attempts: 1 });
    expect(await getRecalculationPreviewInTransaction(f.tx, admin, "sub")).toMatchObject({ canApply: false, canApplyPaid: true, paidDifferenceKopeks: 45000 });
    await f.apply();
    expect(f.invoiceUpdate).not.toHaveBeenCalled();
    expect(f.invoice).toMatchObject({ amountKopeks: 360000, paidAmountKopeks: 360000, status: "PAID" });
    expect(f.adjustmentCreate).toHaveBeenCalledTimes(1);
    await expect(f.apply()).rejects.toThrow("оплата");
    expect(f.adjustmentCreate).toHaveBeenCalledTimes(1);
  });

  it("blocks cash paid increases and started unpaid checkout", async () => {
    const paid = fixture({ previous: 4, next: 8, paid: true, cashPaid: 180000 });
    expect(await getRecalculationPreviewInTransaction(paid.tx, admin, "sub")).toMatchObject({ canApply: false, canApplyPaid: false });
    const attempt = fixture({ previous: 9, next: 8, appliedCredit: 45000, attempts: 1 });
    await expect(attempt.apply()).rejects.toThrow("начата оплата");
    expect(attempt.invoiceUpdate).not.toHaveBeenCalled();
  });

  it("refreshes equal-price paid lesson attribution without rewriting the invoice", async () => {
    const f = fixture({ previous: 8, next: 8, paid: true, cashPaid: 360000, attempts: 1 });
    f.subscription.lessonSnapshots = Array.from({ length: 8 }, (_, i) => ({ lessonId: `old-${i}`, lessonDate: date("2026-11-01") }));
    const preview = await getRecalculationPreviewInTransaction(f.tx, admin, "sub");
    expect(preview).toMatchObject({ canApply: false, canApplyPaid: false, canRefreshScheduleOnly: true, lessonSnapshotChanged: true });
    await f.apply();
    expect(f.subscription.lessonSnapshots.map((row) => row.lessonId)).toContain("lesson-0");
    expect(f.invoiceUpdate).not.toHaveBeenCalled();
    expect(f.adjustmentCreate).not.toHaveBeenCalled();
    expect(await getRecalculationPreviewInTransaction(f.tx, admin, "sub")).toMatchObject({ canRefreshScheduleOnly: false, lessonSnapshotChanged: false });
  });

  it("refreshes unpaid snapshots when counts and money stayed equal", async () => {
    const f = fixture({ previous: 8, next: 8, appliedCredit: 45000 });
    f.subscription.lessonSnapshots = Array.from({ length: 8 }, (_, i) => ({ lessonId: `old-${i}`, lessonDate: date("2026-11-01") }));
    expect(await getRecalculationPreviewInTransaction(f.tx, admin, "sub")).toMatchObject({ canApply: true, lessonSnapshotChanged: true });
    await f.apply();
    expect(f.invoice.amountKopeks).toBe(315000);
    expect(await getRecalculationPreviewInTransaction(f.tx, admin, "sub")).toMatchObject({ canApply: false, lessonSnapshotChanged: false });
  });

  it("rejects a stale invoice version without mutating finances", async () => {
    const f = fixture({ previous: 9, next: 8 });
    const preview = await getRecalculationPreviewInTransaction(f.tx, admin, "sub");
    await expect(applyRecalculationInTransaction(f.tx, admin, "sub", {
      reason: "Расписание", expectedLessonIds: preview.nextLessons.map((lesson) => lesson.id),
      expectedSubscriptionUpdatedAt: preview.subscriptionUpdatedAt, expectedInvoiceUpdatedAt: "outdated"
    })).rejects.toThrow("изменился");
    expect(f.invoiceUpdate).not.toHaveBeenCalled();
    expect(f.adjustmentCreate).not.toHaveBeenCalled();
  });

  it("does not silently reuse an already returned credit if lessons later increase", async () => {
    const f = fixture({ previous: 2, next: 4, appliedCredit: 180000, paid: true });
    f.subscription.billingAdjustments.push({ id: "restored-credit", amountKopeks: 90000 });
    expect(await getRecalculationPreviewInTransaction(f.tx, admin, "sub")).toMatchObject({ canApply: false, canApplyPaid: false, blockReason: expect.stringContaining("ручной проверки") });
  });
});
