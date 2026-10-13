import type { CurrentUser } from "@/server/auth/current-user";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { isLessonInChildPlan, todayInMoscow } from "@/server/children/attendance-plan";
import { isMemberOnDate, setCurrentGroupMembership } from "@/server/children/group-membership";
import { writeAuditLog } from "@/server/audit/audit-service";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { calculateExitPeriod } from "./exit-settlement";
import { admissionStatusAfterLessonBalance } from "./calculations";

export async function getExitSettlement(currentUser: CurrentUser, childId: string, lastDate?: Date, tx?: Prisma.TransactionClient) {
  assertRole(currentUser, ADMIN_ROLES);
  const prisma = tx ?? getPrisma();
  const cutoff = lastDate ?? todayInMoscow();
  if (cutoff > todayInMoscow()) throw new Error("Последняя дата посещения не может быть в будущем.");
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
          billingAdjustments: { select: { id: true, kind: true, amountKopeks: true, appliedAmountKopeks: true } },
          balanceTransactions: { where: { type: "MAKEUP_USED", balanceType: "MAKEUP_BALANCE", reason: "INVOICE_DISCOUNT" }, select: { amount: true } },
          invoices: {
            select: {
              id: true,
              number: true,
              status: true,
              amountKopeks: true,
              paidAmountKopeks: true,
              billingAdjustmentApplications: { select: { id: true } },
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
    .filter((record) => !trialLessonIds.has(record.lessonId) && record.lesson.lessonDate <= cutoff)
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
    const periodCalculation = calculateExitPeriod({
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
      lessonPriceKopeks: subscription.lessonPriceKopeks,
      attendance: regularAttendance,
      paidAmountKopeks,
      invoiceAmountKopeks
    });
    const appliedMakeupDiscountCount = -subscription.balanceTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const earnedAfterDiscountKopeks = Math.max(0, periodCalculation.earnedAmountKopeks - appliedMakeupDiscountCount * subscription.lessonPriceKopeks);
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
      ...periodCalculation,
      appliedMakeupDiscountCount,
      earnedAfterDiscountKopeks
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
  const missingAttendanceDates = pastLessons.filter((lesson) => lesson.lessonDate <= cutoff &&
    !trialLessonIds.has(lesson.id) && !markedLessonIds.has(lesson.id) &&
    child.groupMemberships.some((membership) => membership.groupId === lesson.groupId && isMemberOnDate(membership, lesson.lessonDate)) &&
    isLessonInChildPlan(child.attendancePlans, lesson.lessonDate)
  ).map((lesson) => lesson.lessonDate.toISOString().slice(0, 10));

  const totalPaidKopeks = periods.reduce((sum, period) => sum + period.paidAmountKopeks, 0);
  const totalEarnedKopeks = periods.reduce((sum, period) => sum + period.earnedAfterDiscountKopeks, 0);
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

  const hasExistingAdjustments = child.subscriptions.some((subscription) => subscription.billingAdjustments.length > 0 ||
    subscription.invoices.some((invoice) => invoice.billingAdjustmentApplications.length > 0));
  const revision = createHash("sha256").update(JSON.stringify({
    childId, cutoff: cutoff.toISOString(), status: child.status,
    attendance: child.attendanceRecords.map((record) => [record.lessonId, record.status, record.lesson.status]),
    periods: periods.map((period) => [period.subscriptionId, period.chargedCount, period.earnedAfterDiscountKopeks, period.invoices]),
    adjustments: child.subscriptions.flatMap((subscription) => subscription.billingAdjustments),
    missingAttendanceDates
  })).digest("hex");

  return {
    revision,
    childId: child.id,
    lastDate: cutoff.toISOString().slice(0, 10),
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
    hasExistingAdjustments,
    hasStandaloneInvoices: child.invoices.some((invoice) => invoice.subscriptionId === null),
    note: "Расчёт предварительный. Пропуски без причины оплачиваются; пробные и использованные переносы не входят в стоимость. Проверьте незаполненные табели, зачёты и возвраты перед выплатой."
  };
}

export async function leaveChild(currentUser: CurrentUser, childId: string, reason: string, lastDate: Date, expectedRevision: string) {
  assertRole(currentUser, ADMIN_ROLES);
  await getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "children" WHERE "id" = ${childId}::uuid FOR UPDATE`;
    const settlement = await getExitSettlement(currentUser, childId, lastDate, tx);
    if (settlement.revision !== expectedRevision) throw new Error("Данные табеля или оплаты изменились. Обновите расчёт ухода.");
    if (!["ACTIVE", "PAUSED"].includes(settlement.status)) throw new Error("Ребёнок уже выведен из группы.");
    if (settlement.hasRefundedPayment || settlement.hasExistingAdjustments) throw new Error("У ребёнка уже есть возврат или зачёт. Проверьте финансовую историю перед уходом.");
    if (settlement.missingAttendanceDates.length) throw new Error("Сначала заполните табели до даты ухода: " + settlement.missingAttendanceDates.join(", "));
    if (settlement.hasOverlappingSubscriptions || settlement.hasInvoiceAnomaly || settlement.hasStandaloneInvoices || settlement.attendanceWithoutSubscription.length) {
      throw new Error("Есть нестандартные счета или занятия без абонемента. Исправьте их перед оформлением ухода.");
    }
    let balanceDelta = 0;
    for (const period of settlement.periods) {
      await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "id" = ${period.subscriptionId}::uuid FOR UPDATE`;
      const subscription = await tx.subscription.findUniqueOrThrow({ where: { id: period.subscriptionId }, include: {
        invoices: { where: { status: { not: "CANCELLED" } }, include: { attempts: { select: { id: true } }, payments: { select: { id: true } } } }
      } });
      if (subscription.invoices.length !== 1) throw new Error("Для ухода по каждому абонементу нужен один действующий счёт.");
      const invoice = subscription.invoices[0];
      const nextAmount = period.earnedAfterDiscountKopeks;
      const nextCount = period.chargedCount;
      if (invoice.status === "PAID") {
        const refundDue = Math.max(0, invoice.paidAmountKopeks - nextAmount);
        if (refundDue > 0) await tx.billingAdjustment.create({ data: {
          schoolId: currentUser.schoolId, childId, parentId: invoice.parentId,
          sourceSubscriptionId: subscription.id, sourceInvoiceId: invoice.id,
          kind: "REFUND_DUE", amountKopeks: refundDue, reason,
          createdByUserId: currentUser.id
        } });
        if (nextAmount > invoice.paidAmountKopeks) throw new Error("После ухода стоимость больше оплаченной суммы. Проверьте табель и расчёт вручную.");
      } else {
        if (invoice.paidAmountKopeks > 0 || invoice.payments.length > 0 || invoice.attempts.length > 0 || !["DRAFT", "ISSUED", "OVERDUE"].includes(invoice.status)) {
          throw new Error("По счёту есть оплата или попытка оплаты. Завершите её и повторите расчёт ухода.");
        }
        await tx.invoice.update({ where: { id: invoice.id }, data: {
          amountKopeks: nextAmount,
          status: nextAmount === 0 ? "CANCELLED" : "ISSUED",
          cancelledAt: nextAmount === 0 ? new Date() : undefined
        } });
      }
      const delta = nextCount - subscription.plannedLessonsCount;
      balanceDelta += delta;
      await tx.subscription.update({ where: { id: subscription.id }, data: {
        plannedLessonsCount: nextCount, totalAmountKopeks: period.earnedAmountKopeks,
        paymentStatus: invoice.status === "PAID" ? "PAID" : nextAmount === 0 ? "NOT_INVOICED" : "INVOICED",
        paymentStatusComment: `Уход ${settlement.lastDate}: ${reason}`
      } });
      if (delta !== 0) await tx.lessonBalanceTransaction.create({ data: {
        schoolId: currentUser.schoolId, childId, subscriptionId: subscription.id,
        type: "MANUAL_ADJUSTMENT", balanceType: "LESSON_BALANCE", amount: delta,
        reason: "CHILD_EXIT_SETTLEMENT", createdByUserId: currentUser.id, comment: reason
      } });
    }
    const child = await tx.child.findUniqueOrThrow({ where: { id: childId }, select: { cachedLessonBalance: true, admissionStatus: true } });
    const nextBalance = child.cachedLessonBalance + balanceDelta;
    await tx.child.update({ where: { id: childId }, data: {
      status: "LEFT", currentGroupId: null, cachedLessonBalance: { increment: balanceDelta },
      admissionStatus: admissionStatusAfterLessonBalance(nextBalance, child.admissionStatus)
    } });
    const membershipEnd = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate() + 1));
    await setCurrentGroupMembership(tx, childId, null, membershipEnd);
    await writeAuditLog({ schoolId: currentUser.schoolId, actorUserId: currentUser.id,
      action: "CHILD_EXIT_SETTLED", entityType: "Child", entityId: childId,
      newValue: { status: "LEFT", lastDate: settlement.lastDate, balanceDelta, refundDueKopeks: settlement.potentialCreditKopeks },
      comment: reason }, tx);
  });
  return getExitSettlement(currentUser, childId, lastDate);
}
