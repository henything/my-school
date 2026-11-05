import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { finalizeAttendanceInTransaction } from "@/server/makeups/makeup-service";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";

/** Caller must acquire the child's row lock before reading or approving certificates. */
export async function applyApprovedCertificatePeriodsInTransaction(
  tx: Prisma.TransactionClient, currentUser: CurrentUser, childId: string,
  comment = "Болезнь подтверждена одобренной справкой за период"
) {
  assertRole(currentUser, ADMIN_ROLES);
  await tx.child.findFirstOrThrow({ where: { id: childId, schoolId: currentUser.schoolId }, select: { id: true } });
  const certificates = await tx.medicalCertificate.findMany({
    where: { schoolId: currentUser.schoolId, childId, status: "APPROVED" },
    select: { periodStart: true, periodEnd: true }
  });
  const records = certificates.length ? await tx.attendanceRecord.findMany({
    where: {
      childId, status: "ABSENT_SICK_PENDING", finalStatus: null,
      lesson: {
        schoolId: currentUser.schoolId, status: { not: "CANCELLED" },
        OR: certificates.map(certificate => ({ lessonDate: { gte: certificate.periodStart, lte: certificate.periodEnd } }))
      }
    },
    select: { id: true }, orderBy: { id: "asc" }
  }) : [];
  let finalizedCount = 0;
  let makeupCount = 0;
  for (const record of records) {
    await tx.$queryRaw`SELECT "id" FROM "attendance_records" WHERE "id" = ${record.id}::uuid FOR UPDATE`;
    // Respect decisions committed before this application acquired its locks.
    const latest = await tx.attendanceRecord.findFirst({
      where: { id: record.id, childId, status: "ABSENT_SICK_PENDING", finalStatus: null,
        lesson: { schoolId: currentUser.schoolId, status: { not: "CANCELLED" } } }, select: { id: true }
    });
    if (!latest) continue;
    const result = await finalizeAttendanceInTransaction(tx, currentUser, record.id, {
      finalStatus: "ABSENT_SICK_CONFIRMED", comment
    });
    finalizedCount += 1;
    if (result.makeup) makeupCount += 1;
  }
  const remainingPendingCount = await tx.attendanceRecord.count({
    where: { childId, status: "ABSENT_SICK_PENDING", finalStatus: null,
      lesson: { schoolId: currentUser.schoolId, status: { not: "CANCELLED" } } }
  });
  return { finalizedCount, makeupCount, remainingPendingCount };
}

export async function applyApprovedCertificatePeriodsForChild(currentUser: CurrentUser, childId: string) {
  assertRole(currentUser, ADMIN_ROLES);
  return getPrisma().$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "children" WHERE "id" = ${childId}::uuid FOR UPDATE`;
    return applyApprovedCertificatePeriodsInTransaction(tx, currentUser, childId);
  }, { timeout: 30_000 });
}

/** Daily recovery before monthly billing; failures are returned explicitly for the caller to report. */
export async function reconcileApprovedMedicalCertificates(currentUser: CurrentUser) {
  assertRole(currentUser, ADMIN_ROLES);
  const certificates = await getPrisma().medicalCertificate.findMany({
    where: { schoolId: currentUser.schoolId, status: "APPROVED", child: { status: "ACTIVE" } },
    select: { childId: true }, distinct: ["childId"], orderBy: { childId: "asc" }
  });
  const summary = {
    childCount: 0, finalizedCount: 0, makeupCount: 0, remainingPendingCount: 0,
    errors: [] as Array<{ childId: string; message: string }>
  };
  for (const { childId } of certificates) {
    try {
      const result = await applyApprovedCertificatePeriodsForChild(currentUser, childId);
      summary.childCount += 1;
      summary.finalizedCount += result.finalizedCount;
      summary.makeupCount += result.makeupCount;
      summary.remainingPendingCount += result.remainingPendingCount;
    } catch (error) {
      summary.errors.push({ childId, message: error instanceof Error ? error.message : "Не удалось применить справки." });
    }
  }
  return summary;
}
