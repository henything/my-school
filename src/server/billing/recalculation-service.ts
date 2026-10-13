import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { writeAuditLog } from "@/server/audit/audit-service";
import { todayInMoscow } from "@/server/children/attendance-plan";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { admissionStatusAfterLessonBalance } from "./calculations";
import { calculateRecalculatedAmounts, countPlannedLessonsFromHistory, recalculationBlockReason } from "./recalculation";

export async function getRecalculationPreview(currentUser: CurrentUser, subscriptionId: string) {
  assertRole(currentUser, ADMIN_ROLES);
  return getPrisma().$transaction((tx) => buildPreview(tx, currentUser, subscriptionId));
}

export async function applyRecalculation(currentUser: CurrentUser, subscriptionId: string, input: {
  reason: string;
  expectedSubscriptionUpdatedAt: string;
  expectedInvoiceUpdatedAt: string;
}) {
  assertRole(currentUser, ADMIN_ROLES);
  return getPrisma().$transaction(async (tx) => {
    const initialPreview = await buildPreview(tx, currentUser, subscriptionId);
    await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "id" = ${subscriptionId}::uuid FOR UPDATE`;
    if (initialPreview.invoiceId) {
      await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${initialPreview.invoiceId}::uuid FOR UPDATE`;
    }
    const preview = await buildPreview(tx, currentUser, subscriptionId);
    if (!preview.canApply) throw new Error(preview.blockReason ?? "Этот счёт нельзя пересчитать автоматически.");
    if (preview.subscriptionUpdatedAt !== input.expectedSubscriptionUpdatedAt ||
        preview.invoiceUpdatedAt !== input.expectedInvoiceUpdatedAt) {
      throw new Error("Счёт или абонемент изменился. Получите новый предварительный расчёт.");
    }

    const delta = preview.nextLessonsCount - preview.previousLessonsCount;
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        plannedLessonsCount: preview.nextLessonsCount,
        totalAmountKopeks: preview.nextTotalKopeks,
        paymentStatusComment: `Пересчёт: ${input.reason}`
      }
    });
    await tx.invoice.update({
      where: { id: preview.invoiceId! },
      data: {
        amountKopeks: preview.nextInvoiceAmountKopeks,
        dueDate: preview.nextDueDate ? new Date(`${preview.nextDueDate}T00:00:00.000Z`) : undefined,
        status: preview.nextDueDate && preview.invoiceStatus === "OVERDUE" ? "ISSUED" : undefined
      }
    });

    if (delta !== 0) {
      await tx.lessonBalanceTransaction.create({
        data: {
          schoolId: currentUser.schoolId,
          childId: preview.childId,
          subscriptionId,
          type: "MANUAL_ADJUSTMENT",
          balanceType: "LESSON_BALANCE",
          amount: delta,
          reason: "SUBSCRIPTION_RECALCULATION",
          createdByUserId: currentUser.id,
          comment: input.reason
        }
      });
      await tx.child.update({
        where: { id: preview.childId },
        data: {
          cachedLessonBalance: { increment: delta },
          admissionStatus: admissionStatusAfterLessonBalance(preview.nextBalance, preview.admissionStatus)
        }
      });
    }

    await writeAuditLog({
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      action: "SUBSCRIPTION_AND_INVOICE_RECALCULATED",
      entityType: "Subscription",
      entityId: subscriptionId,
      oldValue: {
        plannedLessonsCount: preview.previousLessonsCount,
        totalAmountKopeks: preview.previousTotalKopeks,
        invoiceAmountKopeks: preview.previousInvoiceAmountKopeks
      },
      newValue: {
        plannedLessonsCount: preview.nextLessonsCount,
        totalAmountKopeks: preview.nextTotalKopeks,
        invoiceAmountKopeks: preview.nextInvoiceAmountKopeks,
        invoiceId: preview.invoiceId,
        balanceDelta: delta
      },
      comment: input.reason
    }, tx);

    return buildPreview(tx, currentUser, subscriptionId);
  });
}

async function buildPreview(tx: Prisma.TransactionClient, currentUser: CurrentUser, subscriptionId: string) {
  const subscription = await tx.subscription.findFirstOrThrow({
    where: { id: subscriptionId, schoolId: currentUser.schoolId },
    include: {
      child: {
        select: {
          id: true,
          fullName: true,
          cachedLessonBalance: true,
          admissionStatus: true,
          groupMemberships: { select: { groupId: true, startDate: true, endDate: true } },
          attendancePlans: { select: { effectiveFrom: true, weekday: true } }
        }
      },
      invoices: {
        include: { attempts: { select: { id: true } }, payments: { select: { id: true } } },
        orderBy: { createdAt: "desc" }
      }
    }
  });
  const memberships = subscription.child.groupMemberships;
  const groupIds = Array.from(new Set(memberships.map((membership) => membership.groupId)));
  const lessons = groupIds.length > 0 ? await tx.lesson.findMany({
    where: {
      schoolId: currentUser.schoolId,
      groupId: { in: groupIds },
      lessonDate: { gte: subscription.periodStart, lte: subscription.periodEnd },
      status: { not: "CANCELLED" }
    },
    select: { id: true, groupId: true, lessonDate: true }
  }) : [];
  const attendance = groupIds.length > 0 ? await tx.attendanceRecord.findMany({
    where: {
      childId: subscription.childId,
      lesson: {
        schoolId: currentUser.schoolId,
        groupId: { in: groupIds },
        lessonDate: { gte: subscription.periodStart, lte: subscription.periodEnd },
        status: { not: "CANCELLED" }
      }
    },
    select: { lessonId: true, status: true }
  }) : [];
  const trials = await tx.trialParticipant.findMany({
    where: { schoolId: currentUser.schoolId, convertedChildId: subscription.childId },
    select: { lessonId: true }
  });
  const trialLessonIds = new Set(trials.map((trial) => trial.lessonId));
  const nextLessonsCount = countPlannedLessonsFromHistory({
    lessons,
    memberships,
    attendancePlans: subscription.child.attendancePlans,
    attendanceRecords: attendance,
    trialLessonIds
  });
  const makeupDiscount = await tx.lessonBalanceTransaction.aggregate({
    where: {
      subscriptionId,
      type: "MAKEUP_USED",
      balanceType: "MAKEUP_BALANCE",
      reason: "INVOICE_DISCOUNT"
    },
    _sum: { amount: true }
  });
  const appliedMakeupCount = -(makeupDiscount._sum.amount ?? 0);
  const { nextTotalKopeks, nextInvoiceAmountKopeks } = calculateRecalculatedAmounts({
    previousLessonsCount: subscription.plannedLessonsCount,
    previousTotalKopeks: subscription.totalAmountKopeks,
    nextLessonsCount,
    appliedMakeupCount
  });
  const invoice = subscription.invoices.find((item) => item.status !== "CANCELLED") ?? null;
  const activeInvoicesCount = subscription.invoices.filter((item) => item.status !== "CANCELLED").length;
  const delta = nextLessonsCount - subscription.plannedLessonsCount;
  const nextBalance = subscription.child.cachedLessonBalance + delta;
  const today = todayInMoscow();
  const nextDueDate = invoice && invoice.dueDate < today && (delta !== 0 || invoice.amountKopeks !== nextInvoiceAmountKopeks)
    ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 7)).toISOString().slice(0, 10)
    : null;

  const blockReason = recalculationBlockReason({
    hasInvoice: Boolean(invoice),
    activeInvoicesCount,
    invoiceStatus: invoice?.status ?? null,
    paidAmountKopeks: invoice?.paidAmountKopeks ?? 0,
    paymentCount: invoice?.payments.length ?? 0,
    attemptCount: invoice?.attempts.length ?? 0,
    nextLessonsCount,
    nextInvoiceAmountKopeks,
    nextBalance,
    unchanged: delta === 0 && invoice?.amountKopeks === nextInvoiceAmountKopeks
  });

  return {
    subscriptionId,
    subscriptionUpdatedAt: subscription.updatedAt.toISOString(),
    invoiceId: invoice?.id ?? null,
    invoiceUpdatedAt: invoice?.updatedAt.toISOString() ?? null,
    invoiceNumber: invoice?.number ?? null,
    invoiceStatus: invoice?.status ?? null,
    childId: subscription.childId,
    childName: subscription.child.fullName,
    admissionStatus: subscription.child.admissionStatus,
    periodStart: subscription.periodStart.toISOString().slice(0, 10),
    periodEnd: subscription.periodEnd.toISOString().slice(0, 10),
    previousLessonsCount: subscription.plannedLessonsCount,
    nextLessonsCount,
    previousTotalKopeks: subscription.totalAmountKopeks,
    nextTotalKopeks,
    previousInvoiceAmountKopeks: invoice?.amountKopeks ?? null,
    nextInvoiceAmountKopeks,
    paidAmountKopeks: invoice?.paidAmountKopeks ?? 0,
    appliedMakeupCount,
    currentBalance: subscription.child.cachedLessonBalance,
    nextBalance,
    nextDueDate,
    canApply: blockReason === null,
    blockReason,
    historyWarning: "Проверьте историю групп и табели за период: старые даты участия могли восстановиться частично."
  };
}
