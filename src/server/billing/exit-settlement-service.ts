import type { CurrentUser } from "@/server/auth/current-user";
import { isLessonInChildPlan, todayInMoscow } from "@/server/children/attendance-plan";
import { updateChild } from "@/server/children/child-service";
import { isMemberOnDate } from "@/server/children/group-membership";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { calculateExitPeriod } from "./exit-settlement";

export async function getExitSettlement(currentUser: CurrentUser, childId: string) {
  assertRole(currentUser, ADMIN_ROLES);
  const prisma = getPrisma();
  const child = await prisma.child.findFirstOrThrow({
    where: { id: childId, schoolId: currentUser.schoolId },
    include: {
      currentGroup: { select: { id: true, name: true } },
      groupMemberships: { select: { groupId: true, startDate: true, endDate: true } },
      attendancePlans: { select: { effectiveFrom: true, weekday: true } },
      attendanceRecords: {
        include: { lesson: { select: { id: true, groupId: true, lessonDate: true, status: true } } }
      },
      convertedTrials: { include: { lesson: { select: { id: true, lessonDate: true } } } },
      makeupCredits: { select: { assignedLessonId: true, status: true } },
      subscriptions: {
        include: {
          invoices: {
            select: {
              id: true,
              number: true,
              status: true,
              amountKopeks: true,
              paidAmountKopeks: true,
              payments: { select: { status: true } }
            }
          }
        },
        orderBy: { periodStart: "desc" }
      },
      invoices: { select: { subscriptionId: true, amountKopeks: true, paidAmountKopeks: true } }
    }
  });

  const trialLessonIds = new Set(child.convertedTrials.map((trial) => trial.lessonId));
  const makeupLessonIds = new Set(child.makeupCredits.filter((credit) => credit.status === "USED" && credit.assignedLessonId)
    .map((credit) => credit.assignedLessonId));
  const regularAttendance = child.attendanceRecords
    .filter((record) => !trialLessonIds.has(record.lessonId))
    .map((record) => ({
      lessonId: record.lessonId,
      lessonDate: record.lesson.lessonDate,
      status: record.status,
      isMakeup: makeupLessonIds.has(record.lessonId)
    }));

  const periods = child.subscriptions.map((subscription) => {
    const invoiceAmountKopeks = subscription.invoices.filter((invoice) => invoice.status !== "CANCELLED")
      .reduce((sum, invoice) => sum + invoice.amountKopeks, 0);
    const paidAmountKopeks = subscription.invoices.reduce((sum, invoice) => sum + invoice.paidAmountKopeks, 0);
    return {
      subscriptionId: subscription.id,
      periodStart: subscription.periodStart.toISOString().slice(0, 10),
      periodEnd: subscription.periodEnd.toISOString().slice(0, 10),
      lessonPriceKopeks: subscription.lessonPriceKopeks,
      plannedLessonsCount: subscription.plannedLessonsCount,
      invoices: subscription.invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amountKopeks: invoice.amountKopeks,
        paidAmountKopeks: invoice.paidAmountKopeks
      })),
      ...calculateExitPeriod({
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
        lessonPriceKopeks: subscription.lessonPriceKopeks,
        attendance: regularAttendance,
        paidAmountKopeks,
        invoiceAmountKopeks
      })
    };
  });

  const attendanceWithoutSubscription = regularAttendance.filter((record) => !child.subscriptions.some((subscription) =>
    record.lessonDate >= subscription.periodStart && record.lessonDate <= subscription.periodEnd
  ));
  const today = todayInMoscow();
  const groupIds = Array.from(new Set(child.groupMemberships.map((membership) => membership.groupId)));
  const pastLessons = groupIds.length > 0 ? await prisma.lesson.findMany({
    where: {
      schoolId: currentUser.schoolId,
      groupId: { in: groupIds },
      lessonDate: { lt: today },
      status: { not: "CANCELLED" }
    },
    select: { id: true, groupId: true, lessonDate: true }
  }) : [];
  const markedLessonIds = new Set(child.attendanceRecords.map((record) => record.lessonId));
  const missingAttendanceDates = pastLessons.filter((lesson) =>
    !trialLessonIds.has(lesson.id) && !markedLessonIds.has(lesson.id) &&
    child.groupMemberships.some((membership) => membership.groupId === lesson.groupId && isMemberOnDate(membership, lesson.lessonDate)) &&
    isLessonInChildPlan(child.attendancePlans, lesson.lessonDate)
  ).map((lesson) => lesson.lessonDate.toISOString().slice(0, 10));

  const totalPaidKopeks = periods.reduce((sum, period) => sum + period.paidAmountKopeks, 0);
  const totalEarnedKopeks = periods.reduce((sum, period) => sum + period.earnedAmountKopeks, 0);
  const differenceKopeks = totalPaidKopeks - totalEarnedKopeks;
  const hasRefundedPayment = child.subscriptions.some((subscription) => subscription.invoices.some((invoice) =>
    invoice.payments.some((payment) => payment.status === "REFUNDED")
  ));
  const hasInvoiceAnomaly = child.subscriptions.some((subscription) =>
    subscription.invoices.filter((invoice) => invoice.status !== "CANCELLED").length > 1 ||
    subscription.invoices.some((invoice) => invoice.status === "CANCELLED" && invoice.paidAmountKopeks > 0)
  );
  const chronologicalSubscriptions = [...child.subscriptions].sort((left, right) => left.periodStart.getTime() - right.periodStart.getTime());
  const hasOverlappingSubscriptions = chronologicalSubscriptions.some((subscription, index) =>
    index > 0 && subscription.periodStart <= chronologicalSubscriptions[index - 1].periodEnd
  );

  return {
    childId: child.id,
    childName: child.fullName,
    status: child.status,
    currentGroup: child.currentGroup,
    trialDates: child.convertedTrials.map((trial) => trial.lesson.lessonDate.toISOString().slice(0, 10)),
    periods,
    totalPaidKopeks,
    totalEarnedKopeks,
    potentialCreditKopeks: Math.max(0, differenceKopeks),
    potentialDebtKopeks: Math.max(0, -differenceKopeks),
    attendanceWithoutSubscription: attendanceWithoutSubscription.map((record) => ({
      date: record.lessonDate.toISOString().slice(0, 10),
      status: record.status
    })),
    missingAttendanceDates,
    hasRefundedPayment,
    hasInvoiceAnomaly,
    hasOverlappingSubscriptions,
    hasStandaloneInvoices: child.invoices.some((invoice) => invoice.subscriptionId === null),
    note: "Расчёт предварительный. Пропуски без причины оплачиваются; пробные и использованные переносы не входят в стоимость. Проверьте незаполненные табели, зачёты и возвраты перед выплатой."
  };
}

export async function leaveChild(currentUser: CurrentUser, childId: string, reason: string) {
  assertRole(currentUser, ADMIN_ROLES);
  await updateChild(currentUser, childId, {
    status: "LEFT",
    currentGroupId: null,
    statusChangeComment: reason
  });
  return getExitSettlement(currentUser, childId);
}
