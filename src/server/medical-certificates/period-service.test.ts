import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ finalize: vi.fn(), prisma: {} as Record<string, unknown> }));
vi.mock("@/server/makeups/makeup-service", () => ({ finalizeAttendanceInTransaction: mocks.finalize }));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => mocks.prisma }));
import { applyApprovedCertificatePeriodsInTransaction, reconcileApprovedMedicalCertificates } from "./period-service";
const admin = { id: "admin", schoolId: "school", login: "admin", displayName: "Администратор", role: "ADMIN" } as const;
const periods = [{ periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-08") },
  { periodStart: new Date("2026-10-06"), periodEnd: new Date("2026-10-15") }];
function fixture() {
  const pending = new Set(["first", "overlap", "last"]);
  const tx = {
    child: { findFirstOrThrow: vi.fn(async () => ({ id: "child" })) },
    medicalCertificate: { findMany: vi.fn(async () => periods) },
    attendanceRecord: {
      findMany: vi.fn(async () => [...pending].map(id => ({ id }))),
      findFirst: vi.fn(async (query: { where: { id: string } }) => pending.has(query.where.id) ? { id: query.where.id } : null),
      count: vi.fn(async () => pending.size)
    },
    $queryRaw: vi.fn(async () => [])
  };
  mocks.finalize.mockImplementation(async (_tx, _user, id) => {
    pending.delete(id);
    return { makeup: id === "last" ? null : { id: `credit-${id}` } };
  });
  return { tx, pending, client: tx as unknown as Prisma.TransactionClient };
}
beforeEach(() => { vi.clearAllMocks(); });
describe("approved certificate period application", () => {
  it("uses every approved inclusive period, pending-only status and school/non-cancelled constraints", async () => {
    const { tx, client } = fixture();
    const result = await applyApprovedCertificatePeriodsInTransaction(client, admin, "child");
    expect(tx.medicalCertificate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "school", childId: "child", status: "APPROVED" } }));
    expect(tx.attendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      childId: "child", status: "ABSENT_SICK_PENDING", finalStatus: null,
      lesson: { schoolId: "school", status: { not: "CANCELLED" }, OR: periods.map(p => ({ lessonDate: { gte: p.periodStart, lte: p.periodEnd } })) }
    } }));
    expect(result).toEqual({ finalizedCount: 3, makeupCount: 2, remainingPendingCount: 0 });
    expect(mocks.finalize).toHaveBeenCalledTimes(3);
    expect(mocks.finalize).toHaveBeenCalledWith(client, admin, "overlap", expect.objectContaining({ finalStatus: "ABSENT_SICK_CONFIRMED" }));
    expect(await applyApprovedCertificatePeriodsInTransaction(client, admin, "child")).toEqual({ finalizedCount: 0, makeupCount: 0, remainingPendingCount: 0 });
    expect(mocks.finalize).toHaveBeenCalledTimes(3);
  });
  it("does not overwrite a decision finalized while waiting for attendance lock", async () => {
    const { tx, client } = fixture();
    tx.attendanceRecord.findFirst.mockResolvedValue(null);
    expect((await applyApprovedCertificatePeriodsInTransaction(client, admin, "child")).finalizedCount).toBe(0);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it("does not query unrestricted attendance when no approved certificates exist", async () => {
    const { tx, client } = fixture();
    tx.medicalCertificate.findMany.mockResolvedValue([]);
    await applyApprovedCertificatePeriodsInTransaction(client, admin, "child");
    expect(tx.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it("rejects trainers and parents before reading sensitive data", async () => {
    const { tx, client } = fixture();
    for (const role of ["COACH", "PARENT"] as const) {
      await expect(applyApprovedCertificatePeriodsInTransaction(client, { ...admin, role }, "child")).rejects.toThrow();
    }
    expect(tx.child.findFirstOrThrow).not.toHaveBeenCalled();
  });
  it("reports a failed child while continuing daily recovery for other children", async () => {
    const { client } = fixture();
    const transaction = vi.fn().mockRejectedValueOnce(new Error("database timeout")).mockImplementationOnce(async callback => callback(client));
    mocks.prisma = { medicalCertificate: { findMany: vi.fn(async () => [{ childId: "failed" }, { childId: "child" }]) }, $transaction: transaction };
    const result = await reconcileApprovedMedicalCertificates(admin);
    expect(result).toMatchObject({ childCount: 1, finalizedCount: 3, errors: [{ childId: "failed", message: "database timeout" }] });
  });
});
