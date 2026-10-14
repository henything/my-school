import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  children: [] as Array<{ id: string; fullName: string; parentId: string | null; currentGroupId: string }>,
  existing: null as null | { id: string; paymentStatus: "INVOICED"; periodStart: Date; periodEnd: Date; invoices: Array<{ id: string; status: "ISSUED" }> },
  pendingSickness: null as null | { id: string },
  invoiceCreate: vi.fn()
}));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({
  child: { findMany: async () => state.children },
  $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
    $queryRaw: async () => [],
    subscription: { findFirst: async () => state.existing },
    attendanceRecord: { findFirst: async () => state.pendingSickness },
    invoice: { create: state.invoiceCreate }
  })
}) }));

import { ensureMonthlySubscriptionsForGroup } from "./billing-service";

const admin = { id: "admin", schoolId: "school", login: "owner", displayName: "Owner", role: "SUPER_ADMIN" } as const;

describe("monthly billing reconciliation", () => {
  beforeEach(() => {
    state.children = [{ id: "child", fullName: "Ребёнок", parentId: "parent", currentGroupId: "group" }];
    state.existing = null;
    state.pendingSickness = null;
    state.invoiceCreate.mockClear();
  });

  it("leaves an existing invoice untouched on a repeated run", async () => {
    state.existing = {
      id: "subscription", paymentStatus: "INVOICED",
      periodStart: new Date("2026-11-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-30T00:00:00.000Z"),
      invoices: [{ id: "invoice", status: "ISSUED" }]
    };
    const result = await ensureMonthlySubscriptionsForGroup(admin, "2026-11");
    expect(result).toMatchObject({ createdCount: 0, existingCount: 1, issues: [] });
    expect(state.invoiceCreate).not.toHaveBeenCalled();
  });

  it("flags unresolved sickness instead of issuing an incorrect invoice", async () => {
    state.pendingSickness = { id: "attendance" };
    const result = await ensureMonthlySubscriptionsForGroup(admin, "2026-11");
    expect(result.createdCount).toBe(0);
    expect(result.issues[0].reason).toContain("болезнь");
    expect(state.invoiceCreate).not.toHaveBeenCalled();
  });
});
