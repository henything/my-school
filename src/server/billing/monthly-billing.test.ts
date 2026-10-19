import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  children: [] as Array<{ id: string; fullName: string; parentId: string | null; currentGroupId: string; attendancePlans: [] }>,
  existing: null as null | { id: string; plannedLessonsCount: number; paymentStatus: "INVOICED"; periodStart: Date; periodEnd: Date; invoices: Array<{ id: string; status: "ISSUED" | "PAID" }> },
  pendingSickness: null as null | { id: string },
  invoiceCreate: vi.fn(),
  openTasks: [] as Array<{ id: string; relatedEntityId: string | null; description: string | null }>,
  taskCreate: vi.fn(),
  membership: null as null | { id: string },
  lessons: [] as Array<{ id: string; groupId: string; lessonDate: Date }>
}));
vi.mock("@/server/tasks/task-service", () => ({
  createTaskIfNotExists: state.taskCreate,
  closeTasksByCondition: vi.fn()
}));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({
  child: { findMany: async () => state.children },
  attendanceRecord: { findFirst: async () => null },
  childGroupMembership: { findFirst: async () => state.membership },
  $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
    $queryRaw: async () => [],
    $executeRaw: async () => [],
    subscription: { findFirst: async () => state.existing },
    child: { findFirst: async () => ({ id: "child", currentGroupId: "group", attendancePlans: [] }) },
    childGroupMembership: { findMany: async () => state.membership ? [{ groupId: "group", startDate: new Date("2026-11-01T00:00:00.000Z"), endDate: null }] : [] },
    trialParticipant: { findMany: async () => [] },
    lesson: { findMany: async () => state.lessons },
    attendanceRecord: { findFirst: async () => state.pendingSickness },
    invoice: { create: state.invoiceCreate },
    task: { findMany: async () => state.openTasks, update: vi.fn() }
  })
}) }));

import { ensureMonthlySubscriptionsForGroup } from "./billing-service";

const admin = { id: "admin", schoolId: "school", login: "owner", displayName: "Owner", role: "SUPER_ADMIN" } as const;

describe("monthly billing reconciliation", () => {
  beforeEach(() => {
    state.children = [{ id: "child", fullName: "Ребёнок", parentId: "parent", currentGroupId: "group", attendancePlans: [] }];
    state.existing = null;
    state.pendingSickness = null;
    state.invoiceCreate.mockClear();
    state.openTasks = [];
    state.taskCreate.mockClear();
    state.membership = null;
    state.lessons = [];
  });

  it("leaves an existing invoice untouched on a repeated run", async () => {
    state.existing = {
      id: "subscription", plannedLessonsCount: 0, paymentStatus: "INVOICED",
      periodStart: new Date("2026-11-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-30T00:00:00.000Z"),
      invoices: [{ id: "invoice", status: "ISSUED" }]
    };
    const result = await ensureMonthlySubscriptionsForGroup(admin, "2026-11");
    expect(result).toMatchObject({ createdCount: 0, existingCount: 1, issues: [] });
    expect(state.invoiceCreate).not.toHaveBeenCalled();
  });

  it("flags an existing paid invoice if the timetable later changes", async () => {
    state.existing = {
      id: "subscription", plannedLessonsCount: 8, paymentStatus: "INVOICED",
      periodStart: new Date("2026-11-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-30T00:00:00.000Z"),
      invoices: [{ id: "invoice", status: "PAID" }]
    };
    state.membership = { id: "membership" };
    const result = await ensureMonthlySubscriptionsForGroup(admin, "2026-11");
    expect(result.issues[0].reason).toContain("Счёт уже оплачен");
    expect(state.invoiceCreate).not.toHaveBeenCalled();
  });

  it("flags unresolved sickness instead of issuing an incorrect invoice", async () => {
    state.pendingSickness = { id: "attendance" };
    const result = await ensureMonthlySubscriptionsForGroup(admin, "2026-11");
    expect(result.createdCount).toBe(0);
    expect(result.issues[0].reason).toContain("болезнь");
    expect(state.invoiceCreate).not.toHaveBeenCalled();
    expect(state.taskCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      type: "BILLING_RECONCILIATION_REQUIRED",
      description: expect.stringContaining("болезнь")
    }));
  });

  it("flags an enrolled child when no lessons exist yet and creates a review task", async () => {
    state.membership = { id: "membership" };
    const result = await ensureMonthlySubscriptionsForGroup(admin, "2026-11");
    expect(result).toMatchObject({ createdCount: 0, noLessonsCount: 1 });
    expect(result.issues[0].reason).toContain("расписание");
    expect(state.taskCreate).toHaveBeenCalledTimes(1);
  });
});
