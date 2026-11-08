import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { finalizeAttendanceInTransaction } from "@/server/makeups/makeup-service";
import { writeAuditLog } from "@/server/audit/audit-service";
import { dateToKey } from "@/server/schedule/generation";
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
  const coveredLesson = {
    schoolId: currentUser.schoolId, status: { not: "CANCELLED" as const },
    trialParticipants: { none: { convertedChildId: childId } },
    OR: certificates.map(certificate => ({ lessonDate: { gte: certificate.periodStart, lte: certificate.periodEnd } }))
  };
  const records = certificates.length ? await tx.attendanceRecord.findMany({
    where: {
      childId, status: { in: ["ABSENT_SICK_PENDING", "ABSENT_UNEXCUSED"] }, finalStatus: null,
      lesson: coveredLesson
    },
    select: { id: true }, orderBy: { id: "asc" }
  }) : [];
  let finalizedCount = 0;
  let makeupCount = 0;
  for (const record of records) {
    await tx.$queryRaw`SELECT "id" FROM "attendance_records" WHERE "id" = ${record.id}::uuid FOR UPDATE`;
    // Respect decisions committed before this application acquired its locks.
    const latest = await tx.attendanceRecord.findFirst({
      where: { id: record.id, childId, status: { in: ["ABSENT_SICK_PENDING", "ABSENT_UNEXCUSED"] }, finalStatus: null,
        lesson: coveredLesson }, select: { id: true, lessonId: true, status: true, comment: true }
    });
    if (!latest) continue;
    // Do not grant sickness compensation on top of an earlier event/quarantine/refund.
    const earlierCompensation = await tx.makeupCredit.findFirst({ where: {
      schoolId: currentUser.schoolId, childId,
      OR: [{ sourceAttendanceRecordId: latest.id }, { sourceLessonId: latest.lessonId }]
    }, select: { id: true } });
    if (earlierCompensation) continue;
    if (latest.status === "ABSENT_UNEXCUSED") {
      await tx.attendanceRecord.update({ where: { id: latest.id }, data: { status: "ABSENT_SICK_PENDING" } });
      await writeAuditLog({ schoolId: currentUser.schoolId, actorUserId: currentUser.id,
        action: "CERTIFICATE_OVERRIDES_COACH_ABSENCE", entityType: "AttendanceRecord", entityId: latest.id,
        oldValue: { status: latest.status, comment: latest.comment },
        newValue: { status: "ABSENT_SICK_PENDING", basis: "APPROVED_CERTIFICATE_PERIOD" }, comment }, tx);
    }
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
  const conflictCount = await reconcilePresenceConflicts(tx, currentUser, childId, certificates.length ? coveredLesson : null);
  return { finalizedCount, makeupCount, remainingPendingCount, conflictCount };
}

const CONFLICT_ENTITY = "CertificateAttendanceConflict";

async function reconcilePresenceConflicts(
  tx: Prisma.TransactionClient, user: CurrentUser, childId: string, coveredLesson: Prisma.LessonWhereInput | null
) {
  const present = coveredLesson ? await tx.attendanceRecord.findMany({
    where: { childId, status: "PRESENT", lesson: coveredLesson },
    select: { lessonId: true, child: { select: { fullName: true } }, lesson: { select: { lessonDate: true, groupId: true, group: { select: { name: true } } } } }
  }) : [];
  const lessonIds = present.map(record => record.lessonId);
  await tx.task.updateMany({ where: {
    schoolId: user.schoolId, childId, relatedEntityType: CONFLICT_ENTITY,
    relatedEntityId: { notIn: lessonIds }, status: { in: ["OPEN", "IN_PROGRESS"] }
  }, data: { status: "CLOSED", closedAt: new Date(), closedByUserId: user.id,
    closedComment: "Противоречие между справкой и посещением устранено." } });
  let conflictCount = 0;
  for (const record of present) {
    // A closed task acknowledges a real early return; daily checks must not reopen it.
    const existing = await tx.task.findFirst({ where: {
      schoolId: user.schoolId, childId, relatedEntityType: CONFLICT_ENTITY, relatedEntityId: record.lessonId
    }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
    if (existing) {
      if (["OPEN", "IN_PROGRESS"].includes(existing.status)) conflictCount += 1;
      continue;
    }
    const assignee = await tx.user.findFirst({ where: { schoolId: user.schoolId,
      role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }], select: { id: true } });
    await tx.task.create({ data: {
      schoolId: user.schoolId, childId, groupId: record.lesson.groupId,
      type: "BILLING_RECONCILIATION_REQUIRED", priority: "HIGH", assigneeUserId: assignee?.id ?? null,
      relatedEntityType: CONFLICT_ENTITY, relatedEntityId: record.lessonId,
      title: `Справка и посещение: ${record.child.fullName}`,
      description: `${dateToKey(record.lesson.lessonDate)}, ${record.lesson.group.name}: в табеле «Был», но дата входит в одобренную справку. Проверьте фактическое посещение. Отметка и оплаты сохранены, перенос не создан.`
    } });
    conflictCount += 1;
  }
  return conflictCount;
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
    childCount: 0, finalizedCount: 0, makeupCount: 0, remainingPendingCount: 0, conflictCount: 0,
    errors: [] as Array<{ childId: string; message: string }>
  };
  for (const { childId } of certificates) {
    try {
      const result = await applyApprovedCertificatePeriodsForChild(currentUser, childId);
      summary.childCount += 1;
      summary.finalizedCount += result.finalizedCount;
      summary.makeupCount += result.makeupCount;
      summary.remainingPendingCount += result.remainingPendingCount;
      summary.conflictCount += result.conflictCount;
    } catch (error) {
      summary.errors.push({ childId, message: error instanceof Error ? error.message : "Не удалось применить справки." });
    }
  }
  return summary;
}
