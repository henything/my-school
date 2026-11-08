import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ finalize: vi.fn(), audit: vi.fn(), prisma: {} as Record<string, unknown> }));
vi.mock("@/server/makeups/makeup-service", () => ({ finalizeAttendanceInTransaction: mocks.finalize }));
vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => mocks.prisma }));
import { applyApprovedCertificatePeriodsInTransaction, reconcileApprovedMedicalCertificates } from "./period-service";
const admin = { id: "admin", schoolId: "school", login: "admin", displayName: "Администратор", role: "ADMIN" } as const;
const periods = [{ periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-08") },
  { periodStart: new Date("2026-10-06"), periodEnd: new Date("2026-10-15") }];
function fixture() {
  const pending = new Map(["first", "overlap", "last"].map(id => [id, "ABSENT_SICK_PENDING"]));
  const present: Array<{ lessonId: string; child: { fullName: string }; lesson: { lessonDate: Date; groupId: string; group: { name: string } } }> = [];
  const tasks: Array<{ id: string; status: string }> = [];
  const tx = {
    child: { findFirstOrThrow: vi.fn(async () => ({ id: "child" })) },
    medicalCertificate: { findMany: vi.fn(async () => periods) },
    attendanceRecord: {
      findMany: vi.fn(async (q: { where: { status: unknown } }) => q.where.status === "PRESENT" ? present : [...pending.keys()].map(id => ({ id }))),
      findFirst: vi.fn(async (q: { where: { id: string } }) => pending.has(q.where.id) ? { id: q.where.id, lessonId: `lesson-${q.where.id}`, status: pending.get(q.where.id), comment: "coach note" } : null),
      update: vi.fn(async (q: { where: { id: string }; data: { status: string } }) => { pending.set(q.where.id, q.data.status); }),
      count: vi.fn(async () => pending.size)
    },
    makeupCredit: { findFirst: vi.fn(async () => null as { id: string } | null) },
    task: {
      updateMany: vi.fn(async () => ({ count: 0 })),
      findFirst: vi.fn(async () => tasks[0] ?? null),
      create: vi.fn(async () => { const task = { id: "task", status: "OPEN" }; tasks.push(task); return task; })
    },
    user: { findFirst: vi.fn(async () => ({ id: "admin" })) },
    $queryRaw: vi.fn(async () => [])
  };
  mocks.finalize.mockImplementation(async (_tx, _user, id) => {
    pending.delete(id);
    return { makeup: id === "last" ? null : { id: `credit-${id}` } };
  });
  return { tx, pending, present, tasks, client: tx as unknown as Prisma.TransactionClient };
}
beforeEach(() => { vi.clearAllMocks(); });
describe("approved certificate period application", () => {
  it("covers both coach absence statuses within inclusive periods, excluding cancelled and trial lessons", async () => {
    const { tx, client } = fixture();
    const result = await applyApprovedCertificatePeriodsInTransaction(client, admin, "child");
    expect(tx.medicalCertificate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "school", childId: "child", status: "APPROVED" } }));
    expect(tx.attendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      childId: "child", status: { in: ["ABSENT_SICK_PENDING", "ABSENT_UNEXCUSED"] }, finalStatus: null,
      lesson: { schoolId: "school", status: { not: "CANCELLED" }, trialParticipants: { none: { convertedChildId: "child" } }, OR: periods.map(p => ({ lessonDate: { gte: p.periodStart, lte: p.periodEnd } })) }
    } }));
    expect(result).toEqual({ finalizedCount: 3, makeupCount: 2, remainingPendingCount: 0, conflictCount: 0 });
    expect(mocks.finalize).toHaveBeenCalledTimes(3);
    expect(await applyApprovedCertificatePeriodsInTransaction(client, admin, "child")).toEqual({ finalizedCount: 0, makeupCount: 0, remainingPendingCount: 0, conflictCount: 0 });
    expect(mocks.finalize).toHaveBeenCalledTimes(3);
  });
  it("normalizes an ordinary coach absence and audits the original mark before finalization", async () => {
    const { tx, pending, client } = fixture();
    pending.clear(); pending.set("wrong-paid", "ABSENT_UNEXCUSED");
    expect((await applyApprovedCertificatePeriodsInTransaction(client, admin, "child")).makeupCount).toBe(1);
    expect(tx.attendanceRecord.update).toHaveBeenCalledWith({ where: { id: "wrong-paid" }, data: { status: "ABSENT_SICK_PENDING" } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "CERTIFICATE_OVERRIDES_COACH_ABSENCE", oldValue: { status: "ABSENT_UNEXCUSED", comment: "coach note" } }), client);
    expect(mocks.finalize).toHaveBeenCalledWith(client, admin, "wrong-paid", expect.objectContaining({ finalStatus: "ABSENT_SICK_CONFIRMED" }));
  });
  it("does not compensate an absence with an existing credit a second time", async () => {
    const { tx, client } = fixture();
    tx.makeupCredit.findFirst.mockResolvedValue({ id: "old-credit" });
    expect((await applyApprovedCertificatePeriodsInTransaction(client, admin, "child")).makeupCount).toBe(0);
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(tx.attendanceRecord.update).not.toHaveBeenCalled();
  });
  it("preserves presence, creates one review task and respects acknowledgement", async () => {
    const { tx, present, tasks, pending, client } = fixture(); pending.clear();
    present.push({ lessonId: "returned", child: { fullName: "Ребёнок" }, lesson: { lessonDate: new Date("2026-10-07"), groupId: "group", group: { name: "Группа" } } });
    expect((await applyApprovedCertificatePeriodsInTransaction(client, admin, "child")).conflictCount).toBe(1);
    expect((await applyApprovedCertificatePeriodsInTransaction(client, admin, "child")).conflictCount).toBe(1);
    expect(tx.task.create).toHaveBeenCalledOnce();
    expect(tx.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({ relatedEntityType: "CertificateAttendanceConflict", relatedEntityId: "returned", childId: "child", assigneeUserId: "admin" }) });
    tasks[0].status = "CLOSED";
    expect((await applyApprovedCertificatePeriodsInTransaction(client, admin, "child")).conflictCount).toBe(0);
    expect(tx.task.create).toHaveBeenCalledOnce();
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(tx.attendanceRecord.update).not.toHaveBeenCalled();
  });
  it("does not overwrite a decision finalized while waiting for attendance lock", async () => {
    const { tx, client } = fixture(); tx.attendanceRecord.findFirst.mockResolvedValue(null);
    expect((await applyApprovedCertificatePeriodsInTransaction(client, admin, "child")).finalizedCount).toBe(0);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it("does not query unrestricted attendance when no approved certificates exist", async () => {
    const { tx, client } = fixture(); tx.medicalCertificate.findMany.mockResolvedValue([]);
    await applyApprovedCertificatePeriodsInTransaction(client, admin, "child");
    expect(tx.attendanceRecord.findMany).not.toHaveBeenCalled(); expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it("rejects trainers and parents before reading sensitive data", async () => {
    const { tx, client } = fixture();
    for (const role of ["COACH", "PARENT"] as const) await expect(applyApprovedCertificatePeriodsInTransaction(client, { ...admin, role }, "child")).rejects.toThrow();
    expect(tx.child.findFirstOrThrow).not.toHaveBeenCalled();
  });
  it("reports a failed child while continuing daily recovery for other children", async () => {
    const { client } = fixture();
    const transaction = vi.fn().mockRejectedValueOnce(new Error("database timeout")).mockImplementationOnce(async callback => callback(client));
    mocks.prisma = { medicalCertificate: { findMany: vi.fn(async () => [{ childId: "failed" }, { childId: "child" }]) }, $transaction: transaction };
    expect(await reconcileApprovedMedicalCertificates(admin)).toMatchObject({ childCount: 1, finalizedCount: 3, errors: [{ childId: "failed", message: "database timeout" }] });
  });
});
