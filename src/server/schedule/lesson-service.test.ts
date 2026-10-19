import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billing = vi.hoisted(() => vi.fn());
vi.mock("@/server/billing/billing-service", () => ({ ensureMonthlySubscriptionsForGroup: billing }));
vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({
  getPrisma: () => ({
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      scheduleTemplate: { findMany: async () => [] }
    })
  })
}));

import { generateLessonsForAcademicYear, generateLessonsForMonth } from "./lesson-service";

const admin = { id: "admin", schoolId: "school", login: "owner", displayName: "Owner", role: "SUPER_ADMIN" } as const;

describe("monthly lesson generation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T12:00:00.000Z"));
    billing.mockReset();
    billing.mockResolvedValue({ createdCount: 1, existingCount: 0, noLessonsCount: 0, issues: [] });
  });
  afterEach(() => vi.useRealTimers());

  it("reconciles bills even when every lesson was generated earlier", async () => {
    const first = await generateLessonsForMonth(admin, { month: "2026-10", groupId: null });
    const second = await generateLessonsForMonth(admin, { month: "2026-10", groupId: null });
    expect(first.createdCount).toBe(0);
    expect(first.billing?.createdCount).toBe(1);
    expect(second.billing).not.toBeNull();
    expect(billing).toHaveBeenCalledTimes(2);
    expect(billing).toHaveBeenCalledWith(admin, "2026-10", null);
  });

  it("defers invoices when next month's timetable is prepared in advance", async () => {
    const result = await generateLessonsForMonth(admin, { month: "2026-11", groupId: null });
    expect(result.billing).toBeNull();
    expect(billing).not.toHaveBeenCalled();
  });

  it("reconciles current-month bills after annual schedule generation", async () => {
    const result = await generateLessonsForAcademicYear(admin, { academicYearStart: 2026, groupId: "group" });
    expect(result.billing?.createdCount).toBe(1);
    expect(billing).toHaveBeenCalledWith(admin, "2026-10", "group");
  });
});
