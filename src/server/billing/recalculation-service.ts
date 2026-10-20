import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { writeAuditLog } from "@/server/audit/audit-service";
import { todayInMoscow } from "@/server/children/attendance-plan";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { admissionStatusAfterLessonBalance } from "./calculations";
import { applyAvailableCreditsToInvoice } from "./billing-adjustment-service";
import { additionalPaidCreditKopeks, calculateRecalculatedAmounts, plannedLessonIdsFromHistory, recalculationBlockReason } from "./recalculation";

export async function getRecalculationPreview(currentUser: CurrentUser, subscriptionId: string, tx?: Prisma.TransactionClient) {
  assertRole(currentUser, ADMIN_ROLES);
  return tx ? buildPreview(tx, currentUser, subscriptionId) : getPrisma().$transaction((inner) => buildPreview(inner, currentUser, subscriptionId));
}

/** Internal preview for an already authorized attendance change in the same transaction. */
export async function getRecalculationPreviewInTransaction(tx: Prisma.TransactionClient, currentUser: CurrentUser, subscriptionId: string) {
  return buildPreview(tx, currentUser, subscriptionId);
}

type RecalculationInput = {
  reason: string;
  paidDifferenceAction?: "CREDIT" | "REFUND_DUE";
  expectedLessonIds: string[];
  expectedSubscriptionUpdatedAt: string;
  expectedInvoiceUpdatedAt: string;
};

export async function applyRecalculation(currentUser: CurrentUser, subscriptionId: string, input: RecalculationInput) {
  assertRole(currentUser, ADMIN_ROLES);
  return getPrisma().$transaction((tx) => applyRecalculationInTransaction(tx, currentUser, subscriptionId, input));
}

export async function applyRecalculationInTransaction(tx: Prisma.TransactionClient, currentUser: CurrentUser, subscriptionId: string, input: RecalculationInput) {
    const initialPreview = await buildPreview(tx, currentUser, subscriptionId);
    await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "id" = ${subscriptionId}::uuid FOR UPDATE`;
    if (initialPreview.invoiceId) {
      await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${initialPreview.invoiceId}::uuid FOR UPDATE`;
    }
    const preview = await buildPreview(tx, currentUser, subscriptionId);
    if (!preview.canApply && !preview.canApplyPaid) throw new Error(preview.blockReason ?? "Этот счёт нельзя пересчитать автоматически.");
    if (preview.canApplyPaid && !input.paidDifferenceAction) throw new Error("Выберите зачёт на следующий месяц или сумму к возврату.");
    if (preview.subscriptionUpdatedAt !== input.expectedSubscriptionUpdatedAt ||
        preview.invoiceUpdatedAt !== input.expectedInvoiceUpdatedAt) {
      throw new Error("Счёт или абонемент изменился. Получите новый предварительный расчёт.");
    }
    if (preview.nextLessons.map((lesson) => lesson.id).sort().join(",") !== [...input.expectedLessonIds].sort().join(",")) {
      throw new Error("Занятия изменились после предварительного расчёта. Получите новый расчёт.");
    }

    const delta = preview.nextLessonsCount - preview.previousLessonsCount;
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        plannedLessonsCount: preview.nextLessonsCount,
        totalAmountKopeks: preview.nextTotalKopeks,
        paymentStatus: preview.canApply && preview.nextInvoiceAmountKopeks === 0 ? "NOT_INVOICED" : preview.canApply && preview.invoiceStatus === "CANCELLED" ? "INVOICED" : undefined,
        paymentStatusComment: `Пересчёт: ${input.reason}`
      }
    });
    if (preview.canApply) {
      await tx.invoice.update({
        where: { id: preview.invoiceId! },
        data: {
          amountKopeks: preview.nextInvoiceAmountKopeks,
          dueDate: preview.nextDueDate ? new Date(`${preview.nextDueDate}T00:00:00.000Z`) : undefined,
          status: preview.nextInvoiceAmountKopeks === 0 ? "CANCELLED" : preview.invoiceStatus === "CANCELLED" || (preview.nextDueDate && preview.invoiceStatus === "OVERDUE") ? "ISSUED" : undefined,
          cancelledAt: preview.nextInvoiceAmountKopeks === 0 ? new Date() : preview.invoiceStatus === "CANCELLED" ? null : undefined
        }
      });
    } else if (preview.canApplyPaid) {
      const source = await tx.invoice.findUniqueOrThrow({ where: { id: preview.invoiceId! }, select: { parentId: true } });
      await tx.billingAdjustment.create({ data: {
        schoolId: currentUser.schoolId, childId: preview.childId, parentId: source.parentId,
        sourceSubscriptionId: subscriptionId, sourceInvoiceId: preview.invoiceId!,
        kind: input.paidDifferenceAction!, amountKopeks: preview.paidDifferenceKopeks,
        reason: input.reason, createdByUserId: currentUser.id
      } });
      if (input.paidDifferenceAction === "CREDIT") {
        const laterInvoices = await tx.invoice.findMany({
          where: { schoolId: currentUser.schoolId, childId: preview.childId,
            periodStart: { gt: new Date(`${preview.periodEnd}T00:00:00.000Z`) },
            status: { in: ["DRAFT", "ISSUED", "OVERDUE"] } },
          orderBy: { periodStart: "asc" }, select: { id: true }
        });
        for (const laterInvoice of laterInvoices) await applyAvailableCreditsToInvoice(tx, laterInvoice.id);
      }
    }

    await tx.subscriptionLesson.deleteMany({ where: { subscriptionId } });
    if (preview.nextLessons.length) await tx.subscriptionLesson.createMany({ data: preview.nextLessons.map((lesson) => ({
      subscriptionId, lessonId: lesson.id, groupId: lesson.groupId,
      lessonDate: new Date(`${lesson.date}T00:00:00.000Z`)
    })) });

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
        invoiceAmountKopeks: preview.canApply ? preview.nextInvoiceAmountKopeks : preview.previousInvoiceAmountKopeks,
        invoiceId: preview.invoiceId,
        balanceDelta: delta,
        paidDifferenceAction: preview.canApplyPaid ? input.paidDifferenceAction : null,
        paidDifferenceKopeks: preview.canApplyPaid ? preview.paidDifferenceKopeks : 0
      },
      comment: input.reason
    }, tx);

    return buildPreview(tx, currentUser, subscriptionId);
}

async function buildPreview(tx: Prisma.TransactionClient, currentUser: CurrentUser, subscriptionId: string) {
  const subscription = await tx.subscription.findFirstOrThrow({
    where: { id: subscriptionId, schoolId: currentUser.schoolId },
    include: {
      child: {
        select: {
          id: true,
          fullName: true,
          parentId: true,
          cachedLessonBalance: true,
          admissionStatus: true,
          groupMemberships: { select: { groupId: true, startDate: true, endDate: true } },
          attendancePlans: { select: { effectiveFrom: true, weekday: true } }
        }
      },
      invoices: {
        include: { attempts: { select: { id: true } }, payments: { select: { id: true } }, billingAdjustmentApplications: { select: { id: true } } },
        orderBy: { createdAt: "desc" }
      },
      lessonSnapshots: { select: { lessonId: true, lessonDate: true } },
      billingAdjustments: { select: { id: true, amountKopeks: true } }
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
  const nextIds = plannedLessonIdsFromHistory({
    lessons,
    memberships,
    attendancePlans: subscription.child.attendancePlans,
    attendanceRecords: attendance,
    trialLessonIds
  });
  const nextLessons = lessons.filter((lesson) => nextIds.has(lesson.id)).map((lesson) => ({ id: lesson.id, groupId: lesson.groupId, date: lesson.lessonDate.toISOString().slice(0, 10) }));
  const nextLessonsCount = nextIds.size;
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
    unitPriceKopeks: subscription.lessonPriceKopeks,
    nextLessonsCount,
    appliedMakeupCount
  });
  const invoice = subscription.invoices.find((item) => item.status !== "CANCELLED") ?? subscription.invoices.find((item) => item.status === "CANCELLED" && item.amountKopeks === 0) ?? null;
  const activeInvoicesCount = subscription.invoices.filter((item) => item.status !== "CANCELLED").length;
  const delta = nextLessonsCount - subscription.plannedLessonsCount;
  const nextBalance = subscription.child.cachedLessonBalance + delta;
  const today = todayInMoscow();
  const nextDueDate = invoice && invoice.dueDate < today && (delta !== 0 || invoice.amountKopeks !== nextInvoiceAmountKopeks)
    ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 7)).toISOString().slice(0, 10)
    : null;

  const blockReason = invoice?.status === "CANCELLED" && subscription.invoices.length > 1
    ? "У абонемента несколько старых счетов. Проверьте их перед повторным выставлением."
    : invoice?.billingAdjustmentApplications.length
    ? "К счёту уже применён зачёт переплаты. Проверьте его вручную перед новым пересчётом."
    : recalculationBlockReason({
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
  const paidDifferenceKopeks = additionalPaidCreditKopeks(
    invoice?.paidAmountKopeks ?? 0,
    nextInvoiceAmountKopeks,
    subscription.billingAdjustments.reduce((sum, adjustment) => sum + adjustment.amountKopeks, 0)
  );
  const canApplyPaid = invoice?.status === "PAID" && !invoice.billingAdjustmentApplications.length && paidDifferenceKopeks > 0 &&
    activeInvoicesCount === 1 && nextBalance >= -1 &&
    (delta !== 0 || subscription.totalAmountKopeks !== nextTotalKopeks);
  const oldIds = new Set(subscription.lessonSnapshots.map((snapshot) => snapshot.lessonId));
  const snapshotComplete = subscription.lessonSnapshots.length === subscription.plannedLessonsCount;

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
    nextLessons,
    previousLessonDates: snapshotComplete ? subscription.lessonSnapshots.map((snapshot) => snapshot.lessonDate.toISOString().slice(0, 10)).sort() : null,
    addedLessonDates: snapshotComplete ? nextLessons.filter((lesson) => !oldIds.has(lesson.id)).map((lesson) => lesson.date).sort() : null,
    removedLessonDates: snapshotComplete ? subscription.lessonSnapshots.filter((snapshot) => !nextIds.has(snapshot.lessonId)).map((snapshot) => snapshot.lessonDate.toISOString().slice(0, 10)).sort() : null,
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
    canApplyPaid,
    paidDifferenceKopeks,
    blockReason: canApplyPaid ? null : blockReason,
    historyWarning: "Проверьте историю групп и табели за период: старые даты участия могли восстановиться частично."
  };
}
