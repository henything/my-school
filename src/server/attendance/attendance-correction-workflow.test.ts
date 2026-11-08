import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";
import { previewAttendanceCorrection, saveAttendanceCorrection } from "./attendance-correction-workflow";

const fixture = vi.hoisted(() => ({ marked: false, version: "original", apply: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({
  getPrisma: () => ({
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const before = fixture.marked;
      try {
        return await callback({
          $queryRaw: async () => [],
          lesson: { findFirstOrThrow: async () => ({ id: "lesson", lessonDate: new Date("2026-10-27"), updatedAt: fixture.version, attendanceRecords: [] }) },
          subscription: { findMany: async () => [{ id: "subscription", childId: "child", updatedAt: "v1", invoices: [{ id: "invoice", updatedAt: "v1" }] }] }
        });
      } catch (error) { fixture.marked = before; throw error; }
    }
  })
}));
vi.mock("./attendance-service", () => ({ correctAttendanceInTransaction: async () => { fixture.marked = true; return { id: "lesson" }; } }));
vi.mock("@/server/billing/recalculation-service", () => ({
  getRecalculationPreview: async () => ({
    subscriptionId: "subscription", childName: "Ребёнок", childId: "child", periodStart: "2026-10-01", invoiceNumber: "INV", invoiceStatus: "PAID",
    previousLessonsCount: 8, nextLessonsCount: fixture.marked ? 7 : 8,
    previousInvoiceAmountKopeks: 360000, nextInvoiceAmountKopeks: fixture.marked ? 315000 : 360000,
    nextLessons: fixture.marked ? [{ id: "kept" }] : [{ id: "kept" }, { id: "quarantine" }],
    canApply: false, canApplyPaid: fixture.marked, blockReason: null, paidDifferenceKopeks: fixture.marked ? 45000 : 0,
    subscriptionUpdatedAt: "v1", invoiceUpdatedAt: "v1"
  }),
  applyRecalculationInTransaction: (...args: unknown[]) => fixture.apply(...args)
}));

const admin: CurrentUser = { id: "admin", schoolId: "school", login: "admin", displayName: "Admin", role: "ADMIN" };
const correction = { correctionReason: "Уточнили карантин у тренера", records: [{ childId: "child", status: "ABSENT_QUARANTINE" as const, comment: "" }] };

beforeEach(() => { fixture.marked = false; fixture.version = "original"; fixture.apply.mockReset(); });
describe("attendance correction preview/save round trip", () => {
  it("accepts the real POST payload with revision and paid settlement metadata", async () => {
    const preview = await previewAttendanceCorrection(admin, "lesson", correction);
    expect(fixture.marked).toBe(false);
    const payload = { ...correction, expectedRevision: preview.revision, paidDifferenceAction: "CREDIT" as const };
    await expect(saveAttendanceCorrection(admin, "lesson", payload, payload.expectedRevision, payload.paidDifferenceAction))
      .resolves.toMatchObject({ financialChanges: 1 });
    expect(fixture.marked).toBe(true);
    expect(fixture.apply).toHaveBeenCalledWith(expect.anything(), admin, "subscription", expect.objectContaining({ paidDifferenceAction: "CREDIT" }));
  });

  it("still rejects a real concurrent change and rolls back marks", async () => {
    const preview = await previewAttendanceCorrection(admin, "lesson", correction);
    fixture.version = "changed elsewhere";
    await expect(saveAttendanceCorrection(admin, "lesson", correction, preview.revision, "CREDIT")).rejects.toThrow("изменился после предварительного расчёта");
    expect(fixture.marked).toBe(false);
    expect(fixture.apply).not.toHaveBeenCalled();
  });

  it("requires a fresh preview when attendance itself changes", async () => {
    const preview = await previewAttendanceCorrection(admin, "lesson", correction);
    const changed = { ...correction, records: [{ ...correction.records[0], status: "PRESENT" as const }] };
    await expect(saveAttendanceCorrection(admin, "lesson", changed, preview.revision, "CREDIT")).rejects.toThrow("изменился после предварительного расчёта");
    expect(fixture.marked).toBe(false);
    expect(fixture.apply).not.toHaveBeenCalled();
  });
});
