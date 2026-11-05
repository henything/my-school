import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  record: { childId: "child", status: "ABSENT_SICK_PENDING", finalStatus: null as string | null, lesson: { groupId: "group" } },
  tasks: [] as Array<{ id: string; childId: string; type: string; dueAt: Date | null; createdAt: Date; relatedEntityType: string; relatedEntityId: string; status: string; assigneeUserId: string | null; assigneeUser: null }>,
  taskCreate: vi.fn(), taskUpdate: vi.fn(), advisory: vi.fn(),
  found: true,
  finalize: vi.fn(), ensure: vi.fn(), lock: vi.fn(), children: [] as unknown[], pending: [] as unknown[], preview: vi.fn()
}));
vi.mock("@/server/makeups/makeup-service", () => ({ finalizeAttendanceInTransaction: state.finalize }));
vi.mock("./billing-service", () => ({ ensureMonthlySubscriptionsForGroup: state.ensure }));
vi.mock("./recalculation-service", () => ({ getRecalculationPreview: state.preview }));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({
  child: { findMany: async () => state.children },
  attendanceRecord: { findMany: async () => state.pending },
  task: { findMany: async () => [] }, user: { findFirst: async () => ({ displayName: "Администратор" }) },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({
    $queryRaw: state.lock, $executeRaw: state.advisory,
    child: { findMany: async () => state.children },
    user: { findFirst: async () => ({ id: "admin", displayName: "Администратор" }), findMany: async () => [{ id: "admin" }] },
    task: { findMany: async () => state.tasks, create: state.taskCreate, update: state.taskUpdate },
    attendanceRecord: { findFirst: async () => state.found ? { childId: "child" } : null, findFirstOrThrow: async () => state.record, findMany: async () => state.pending }
  })
}) }));

import { getBillingControl, incompatibleWeekday, resolveBillingSickness, syncBillingControlTasks } from "./control-service";
const admin = { id: "admin", schoolId: "school", login: "admin", displayName: "Администратор", role: "ADMIN" } as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  state.record = { childId: "child", status: "ABSENT_SICK_PENDING", finalStatus: null, lesson: { groupId: "group" } };
  state.found = true; state.children = []; state.pending = []; state.tasks = [];
  state.taskCreate.mockReset(); state.taskUpdate.mockReset(); state.advisory.mockReset();
  state.taskCreate.mockResolvedValue({ id: "new-task" });
  state.lock.mockReset(); state.finalize.mockReset(); state.ensure.mockReset(); state.preview.mockReset();
  state.ensure.mockResolvedValue({ createdCount: 1 });
});

afterEach(() => vi.useRealTimers());

describe("billing control illness decisions", () => {
  it("rejects financial decisions for coaches before touching records", async () => {
    await expect(resolveBillingSickness({ ...admin, role: "COACH" }, "record", { finalStatus: "ABSENT_SICK_CONFIRMED", comment: "Справка" })).rejects.toThrow();
    expect(state.lock).not.toHaveBeenCalled();
  });
  it("requires a nonempty reason", async () => {
    await expect(resolveBillingSickness(admin, "record", { finalStatus: "ABSENT_UNEXCUSED_FINAL", comment: " " })).rejects.toThrow();
    expect(state.finalize).not.toHaveBeenCalled();
  });
  it("rejects an inaccessible record and does not run reconciliation", async () => {
    state.found = false;
    await expect(resolveBillingSickness(admin, "other-school-record", { finalStatus: "ABSENT_SICK_CONFIRMED", comment: "Справка" })).rejects.toThrow("не найдена");
    expect(state.finalize).not.toHaveBeenCalled(); expect(state.ensure).not.toHaveBeenCalled();
  });
  it("locks child and attendance before finalization and reconciles only the affected group", async () => {
    const result = await resolveBillingSickness(admin, "record", { finalStatus: "ABSENT_SICK_CONFIRMED", comment: "Справка проверена" });
    expect(state.lock).toHaveBeenCalledTimes(2);
    expect(state.finalize).toHaveBeenCalledWith(expect.anything(), admin, "record", { finalStatus: "ABSENT_SICK_CONFIRMED", comment: "Справка проверена" });
    expect(state.ensure).toHaveBeenCalledWith(admin, "2026-11", "group");
    expect(result.alreadyResolved).toBe(false);
  });
  it("does not create another transfer on a repeated confirmation", async () => {
    state.record.finalStatus = "ABSENT_SICK_CONFIRMED";
    const result = await resolveBillingSickness(admin, "record", { finalStatus: "ABSENT_SICK_CONFIRMED", comment: "Повтор" });
    expect(result.alreadyResolved).toBe(true); expect(state.finalize).not.toHaveBeenCalled();
    expect(state.ensure).toHaveBeenCalledTimes(1);
  });
  it("does not silently change a conflicting resolved decision", async () => {
    state.record.finalStatus = "ABSENT_UNEXCUSED_FINAL";
    await expect(resolveBillingSickness(admin, "record", { finalStatus: "ABSENT_SICK_CONFIRMED", comment: "Другое решение" })).rejects.toThrow("уже изменена");
    expect(state.finalize).not.toHaveBeenCalled();
  });
  it("reports reconciliation failure without claiming the saved decision failed", async () => {
    state.ensure.mockRejectedValue(new Error("Database busy"));
    const result = await resolveBillingSickness(admin, "record", { finalStatus: "ABSENT_UNEXCUSED_FINAL", comment: "Справка не предоставлена" });
    expect(state.finalize).toHaveBeenCalledTimes(1); expect(result.warning).toContain("Решение сохранено");
  });
});

describe("live billing control", () => {
  it("includes an active child without a current group or subscription", async () => {
    state.children = [{ id: "child", fullName: "Ребёнок", invoices: [], currentGroup: null, subscriptions: [], attendancePlans: [] }];
    const result = await getBillingControl(admin);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind: "MISSING_INVOICE", groupName: "Без группы", assignee: "Администратор", overdue: true });
  });
  it("does not flag a zero invoice already covered by credits as missing", async () => {
    state.children = [{ id: "child", fullName: "Ребёнок", invoices: [], currentGroup: null, attendancePlans: [], subscriptions: [{ id: "sub", invoices: [{ id: "inv", status: "CANCELLED", amountKopeks: 0, billingAdjustmentApplications: [] }] }] }];
    state.preview.mockResolvedValue({ invoiceId: "inv", previousLessonsCount: 0, nextLessonsCount: 0, previousTotalKopeks: 0, nextTotalKopeks: 0, previousInvoiceAmountKopeks: 0, nextInvoiceAmountKopeks: 0 });
    expect((await getBillingControl(admin)).items).toHaveLength(0);
  });
  it("uses the credit-aware authoritative amount when detecting invoice mismatches", async () => {
    state.children = [{ id: "child", fullName: "Ребёнок", invoices: [], currentGroup: null, attendancePlans: [], subscriptions: [{ id: "sub", invoices: [{ id: "inv", status: "ISSUED", amountKopeks: 315000, billingAdjustmentApplications: [{ amountKopeks: 45000 }] }] }] }];
    state.preview.mockResolvedValue({ invoiceId: "inv", previousLessonsCount: 8, nextLessonsCount: 8, previousTotalKopeks: 360000, nextTotalKopeks: 360000, previousInvoiceAmountKopeks: 315000, nextInvoiceAmountKopeks: 315000 });
    expect((await getBillingControl(admin)).items).toHaveLength(0);
  });
  it("keeps handled paid reductions quiet when the difference was already credited", async () => {
    state.children = [{ id: "child", fullName: "Ребёнок", invoices: [], currentGroup: null, attendancePlans: [], subscriptions: [{ id: "sub", invoices: [{ id: "inv", status: "PAID", amountKopeks: 405000 }] }] }];
    state.preview.mockResolvedValue({ invoiceId: "inv", invoiceStatus: "PAID", previousLessonsCount: 8, nextLessonsCount: 8, previousTotalKopeks: 360000, nextTotalKopeks: 360000, previousInvoiceAmountKopeks: 405000, nextInvoiceAmountKopeks: 360000, additionalCreditKopeks: 0, canApplyPaid: false, lessonSnapshotChanged: false });
    expect((await getBillingControl(admin)).items).toHaveLength(0);
    state.preview.mockResolvedValue({ invoiceId: "inv", invoiceStatus: "PAID", previousLessonsCount: 8, nextLessonsCount: 8, previousTotalKopeks: 360000, nextTotalKopeks: 360000, previousInvoiceAmountKopeks: 405000, nextInvoiceAmountKopeks: 360000, additionalCreditKopeks: 45000, canApplyPaid: true, lessonSnapshotChanged: false });
    expect((await getBillingControl(admin)).items[0].kind).toBe("MISMATCH");
  });
  it("flags a missing entire schedule for a fixed weekday", () => {
    expect(incompatibleWeekday([{ effectiveFrom: new Date("2026-11-01Z"), weekday: 3 }], [], new Date("2026-11-04Z"))).toBe(3);
  });
  it("detects a removed individual day but not an unrestricted child", () => {
    const lessons = [{ lessonDate: new Date("2026-11-05Z") }, { lessonDate: new Date("2026-11-10Z") }];
    expect(incompatibleWeekday([{ effectiveFrom: new Date("2026-11-01Z"), weekday: 3 }], lessons, new Date("2026-11-04Z"))).toBe(3);
    expect(incompatibleWeekday([{ effectiveFrom: new Date("2026-11-01Z"), weekday: null }], lessons, new Date("2026-11-04Z"))).toBeNull();
  });
});

function reminder(overrides: Partial<(typeof state.tasks)[number]> = {}) {
  return {
    id: "task", childId: "child", type: "BILLING_RECONCILIATION_REQUIRED", dueAt: new Date("2026-11-02Z"),
    createdAt: new Date("2026-11-01Z"), relatedEntityType: "BillingControl:2026-11", relatedEntityId: "child",
    status: "OPEN", assigneeUserId: "admin", assigneeUser: null, ...overrides
  };
}
function missingChild() {
  state.children = [{ id: "child", fullName: "Ребёнок", invoices: [], currentGroup: null, subscriptions: [], attendancePlans: [] }];
}

describe("persistent billing control reminders", () => {
  it("creates one assigned overdue reminder per child and holds a school advisory lock", async () => {
    missingChild();
    const result = await syncBillingControlTasks(admin);
    expect(state.advisory).toHaveBeenCalledTimes(1);
    expect(state.taskCreate).toHaveBeenCalledTimes(1);
    expect(state.taskCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      schoolId: "school", relatedEntityType: "BillingControl:2026-11", relatedEntityId: "child", childId: "child", assigneeUserId: "admin", priority: "CRITICAL", status: "OPEN"
    }) });
    expect(result).toMatchObject({ issueCount: 1, childrenCount: 1, createdCount: 1 });
  });
  it("reuses and reopens a manually cancelled task with its original deadline", async () => {
    missingChild(); state.tasks = [reminder({ status: "CANCELLED", assigneeUserId: "disabled-admin" })];
    const result = await syncBillingControlTasks(admin);
    expect(state.taskCreate).not.toHaveBeenCalled();
    expect(state.taskUpdate).toHaveBeenCalledWith({ where: { id: "task" }, data: expect.objectContaining({ status: "OPEN", dueAt: new Date("2026-11-02Z"), assigneeUserId: "admin", priority: "CRITICAL", closedAt: null }) });
    expect(result.reopenedCount).toBe(1);
  });
  it("preserves in-progress work and does not extend the reminder deadline", async () => {
    missingChild(); state.tasks = [reminder({ status: "IN_PROGRESS" })];
    await syncBillingControlTasks(admin);
    expect(state.taskUpdate).toHaveBeenCalledWith({ where: { id: "task" }, data: expect.objectContaining({ status: "IN_PROGRESS", dueAt: new Date("2026-11-02Z") }) });
    expect(state.taskCreate).not.toHaveBeenCalled();
  });
  it("closes the persistent reminder once the actual cause disappears", async () => {
    state.tasks = [reminder()];
    const result = await syncBillingControlTasks(admin);
    expect(state.taskUpdate).toHaveBeenCalledWith({ where: { id: "task" }, data: expect.objectContaining({ status: "CLOSED", closedByUserId: "admin" }) });
    expect(result.closedCount).toBe(1); expect(result.issueCount).toBe(0);
  });
  it("groups a missing invoice and invalid day for the same child into one task", async () => {
    state.children = [{ id: "child", fullName: "Ребёнок", currentGroupId: "group", invoices: [], currentGroup: { name: "Группа", lessons: [] }, subscriptions: [], attendancePlans: [{ effectiveFrom: new Date("2026-11-01Z"), weekday: 3 }] }];
    const result = await syncBillingControlTasks(admin);
    expect(result).toMatchObject({ issueCount: 2, childrenCount: 1 });
    expect(state.taskCreate).toHaveBeenCalledTimes(1);
    const description = state.taskCreate.mock.calls[0][0].data.description;
    expect(description).toContain("нет действующего счёта"); expect(description).toContain("Индивидуальный день");
  });
  it("closes an obsolete month reminder while creating the current one", async () => {
    missingChild(); state.tasks = [reminder({ relatedEntityType: "BillingControl:2026-10" })];
    const result = await syncBillingControlTasks(admin);
    expect(result).toMatchObject({ createdCount: 1, closedCount: 1 });
    expect(state.taskUpdate).toHaveBeenCalledWith({ where: { id: "task" }, data: expect.objectContaining({ closedComment: "Контроль перенесён в текущий расчётный месяц." }) });
  });
  it("refuses persistent reconciliation for a coach", async () => {
    await expect(syncBillingControlTasks({ ...admin, role: "COACH" })).rejects.toThrow();
    expect(state.advisory).not.toHaveBeenCalled();
  });
});
