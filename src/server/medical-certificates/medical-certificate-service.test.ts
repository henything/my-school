import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  existing: {} as Record<string, unknown>, update: vi.fn(), query: vi.fn(), apply: vi.fn(), billing: vi.fn(), audit: vi.fn(), lookup: vi.fn()
}));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({ $transaction: async (callback: (tx: unknown) => unknown) => callback({
  $queryRaw: state.query, medicalCertificate: { findFirstOrThrow: state.lookup, update: state.update }
}) }) }));
vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: state.audit }));
vi.mock("@/server/parents/parent-auth-service", () => ({ getActiveParentAccount: vi.fn() }));
vi.mock("@/server/billing/billing-service", () => ({ ensureMonthlySubscriptionsForGroup: state.billing }));
vi.mock("./period-service", () => ({ applyApprovedCertificatePeriodsInTransaction: state.apply }));
import { reviewMedicalCertificate } from "./medical-certificate-service";
const admin = { id: "admin", schoolId: "school", login: "admin", displayName: "Admin", role: "ADMIN" } as const;
beforeEach(() => {
  vi.clearAllMocks();
  state.existing = { id: "certificate", childId: "child", status: "PENDING", periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-31"),
    attendanceRecord: null, attendanceRecordId: null, createdAt: new Date("2026-11-01"), reviewedAt: null, adminComment: null };
  state.lookup.mockImplementation(async () => state.existing);
  state.update.mockImplementation(async ({ data }) => ({ ...state.existing, ...data }));
  state.apply.mockResolvedValue({ finalizedCount: 3, makeupCount: 3, remainingPendingCount: 0 });
  state.billing.mockResolvedValue({ createdCount: 1, existingCount: 0, noLessonsCount: 0, issues: [] });
});
describe("medical certificate review", () => {
  it("approves an unlinked certificate and applies every approved child period before scoped billing", async () => {
    const result = await reviewMedicalCertificate(admin, "certificate", { status: "APPROVED" });
    expect(result.application.finalizedCount).toBe(3);
    expect(result.reconciliation?.createdCount).toBe(1);
    expect(result.warning).toBeNull();
    expect(state.lookup).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "certificate", schoolId: "school" } }));
    expect(state.query).toHaveBeenCalledOnce();
    expect(state.apply).toHaveBeenCalledWith(expect.anything(), admin, "child", expect.any(String));
    expect(state.billing).toHaveBeenCalledWith(admin, expect.stringMatching(/^\d{4}-\d{2}$/), undefined, ["child"]);
  });
  it("reapplies approved period preserving the original author, time and comment", async () => {
    state.existing = { ...state.existing, status: "APPROVED", reviewedAt: new Date("2026-10-20"), reviewedBy: { id: "original" }, adminComment: "original decision" };
    const result = await reviewMedicalCertificate(admin, "certificate", { status: "APPROVED", adminComment: "retry" });
    expect(state.update).not.toHaveBeenCalled();
    expect(result.certificate.reviewedAt).toBe("2026-10-20T00:00:00.000Z");
    expect(result.certificate.adminComment).toBe("original decision");
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "MEDICAL_CERTIFICATE_REAPPLIED" }), expect.anything());
  });
  it("does not reverse a rejected certificate", async () => {
    state.existing.status = "REJECTED";
    await expect(reviewMedicalCertificate(admin, "certificate", { status: "APPROVED" })).rejects.toThrow("решение уже принято");
    expect(state.apply).not.toHaveBeenCalled();
    expect(state.billing).not.toHaveBeenCalled();
  });
  it("rejects without approving attendance or creating invoices", async () => {
    const result = await reviewMedicalCertificate(admin, "certificate", { status: "REJECTED", adminComment: "не подходит" });
    expect(result.certificate.status).toBe("REJECTED");
    expect(state.apply).not.toHaveBeenCalled();
    expect(state.billing).not.toHaveBeenCalled();
  });
  it("keeps the committed medical decision visible when billing fails", async () => {
    state.billing.mockRejectedValueOnce(new Error("connection lost"));
    const result = await reviewMedicalCertificate(admin, "certificate", { status: "APPROVED" });
    expect(result.certificate.status).toBe("APPROVED");
    expect(result.application.finalizedCount).toBe(3);
    expect(result.reconciliation).toBeNull();
    expect(result.warning).toContain("сохранено");
  });
  it("exposes remaining out-of-period sickness blocking a new invoice", async () => {
    state.billing.mockResolvedValueOnce({ createdCount: 0, existingCount: 0, noLessonsCount: 0,
      issues: [{ childId: "child", reason: "Есть неподтверждённая болезнь" }] });
    const result = await reviewMedicalCertificate(admin, "certificate", { status: "APPROVED" });
    expect(result.warning).toContain("неподтверждённая болезнь");
  });
  it("denies coach and parent review before transaction", async () => {
    for (const role of ["COACH", "PARENT"] as const) {
      await expect(reviewMedicalCertificate({ ...admin, role }, "certificate", { status: "APPROVED" })).rejects.toThrow();
    }
    expect(state.lookup).not.toHaveBeenCalled();
  });
});
