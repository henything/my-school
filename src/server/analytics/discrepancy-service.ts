import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { calculateRecalculatedAmounts, plannedLessonIdsFromHistory } from "@/server/billing/recalculation";

export type Discrepancy = { kind: string; childName: string; detail: string; href: string };

export async function listDiscrepancies(currentUser: CurrentUser) {
  assertRole(currentUser, ADMIN_ROLES);
  const prisma = getPrisma();
  const [trials, children, subscriptions, lessons, attendance, discounts] = await Promise.all([
    prisma.trialParticipant.findMany({ where: { schoolId: currentUser.schoolId, convertedChildId: null, status: { in: ["TRIAL_ATTENDED", "TRIAL_NO_SHOW"] } },
      select: { childName: true, lesson: { select: { lessonDate: true } } } }),
    prisma.child.findMany({ where: { schoolId: currentUser.schoolId }, select: {
      id: true, fullName: true, status: true, cachedLessonBalance: true, createdAt: true,
      convertedTrials: { select: { lessonId: true } },
      attendanceRecords: { select: { lesson: { select: { lessonDate: true } } } }
    } }),
    prisma.subscription.findMany({ where: { schoolId: currentUser.schoolId }, select: {
      id: true, childId: true, periodStart: true, periodEnd: true, plannedLessonsCount: true, totalAmountKopeks: true, lessonPriceKopeks: true,
      child: { select: { fullName: true, groupMemberships: { select: { groupId: true, startDate: true, endDate: true } }, attendancePlans: { select: { effectiveFrom: true, weekday: true } }, convertedTrials: { select: { lessonId: true } } } },
      invoices: { where: { status: { not: "CANCELLED" } }, select: { id: true, number: true, status: true, amountKopeks: true, paidAmountKopeks: true,
        billingAdjustmentApplications: { select: { amountKopeks: true } } } },
      billingAdjustments: { select: { id: true } }
    } }),
    prisma.lesson.findMany({ where: { schoolId: currentUser.schoolId }, select: { id: true, groupId: true, lessonDate: true, status: true } }),
    prisma.attendanceRecord.findMany({ where: { lesson: { schoolId: currentUser.schoolId } }, select: { childId: true, lessonId: true, status: true, lesson: { select: { lessonDate: true } } } }),
    prisma.lessonBalanceTransaction.findMany({ where: { schoolId: currentUser.schoolId, type: "MAKEUP_USED", balanceType: "MAKEUP_BALANCE", reason: "INVOICE_DISCOUNT" }, select: { subscriptionId: true, amount: true } })
  ]);
  const issues: Discrepancy[] = [];
  for (const trial of trials) issues.push({ kind: "Пробное без ребёнка", childName: trial.childName ?? "Без имени", detail: `Пробное ${trial.lesson.lessonDate.toISOString().slice(0, 10)} не связано с карточкой.`, href: "/admin/trials" });
  for (const child of children) {
    const firstEarlier = child.attendanceRecords.find((record) => record.lesson.lessonDate < new Date(Date.UTC(child.createdAt.getUTCFullYear(), child.createdAt.getUTCMonth(), child.createdAt.getUTCDate())));
    if (firstEarlier) issues.push({ kind: "Отметка раньше карточки", childName: child.fullName, detail: `Есть посещение ${firstEarlier.lesson.lessonDate.toISOString().slice(0, 10)} до даты создания карточки. Проверьте первую платную дату.`, href: "/admin/directories" });
    if (child.status === "LEFT" && child.cachedLessonBalance > 0) issues.push({ kind: "Остаток после ухода", childName: child.fullName, detail: `Баланс: ${child.cachedLessonBalance} занятий. Проверьте расчёт ухода и сумму к возврату.`, href: "/admin/directories" });
  }
  const subscriptionsByChild = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions) subscriptionsByChild.set(subscription.childId, [...(subscriptionsByChild.get(subscription.childId) ?? []), subscription]);
  const trialLessonKeys = new Set(children.flatMap((child) => child.convertedTrials.map((trial) => `${child.id}:${trial.lessonId}`)));
  const childNames = new Map(children.map((child) => [child.id, child.fullName]));
  for (const record of attendance) {
    if (!["PRESENT", "ABSENT_UNEXCUSED"].includes(record.status) || trialLessonKeys.has(`${record.childId}:${record.lessonId}`)) continue;
    if ((subscriptionsByChild.get(record.childId) ?? []).some((subscription) => record.lesson.lessonDate >= subscription.periodStart && record.lesson.lessonDate <= subscription.periodEnd)) continue;
    issues.push({ kind: "Занятие без абонемента", childName: childNames.get(record.childId) ?? "Ребёнок",
      detail: `${record.lesson.lessonDate.toISOString().slice(0, 10)}: платная отметка без абонемента за этот день. Выставьте счёт или уточните пробное.`, href: "/admin/billing" });
  }
  for (const subscription of subscriptions) {
    const periodLessons = lessons.filter((lesson) => lesson.status !== "CANCELLED" && lesson.lessonDate >= subscription.periodStart && lesson.lessonDate <= subscription.periodEnd &&
      subscription.child.groupMemberships.some((membership) => membership.groupId === lesson.groupId));
    const ids = plannedLessonIdsFromHistory({
      lessons: periodLessons, memberships: subscription.child.groupMemberships,
      attendancePlans: subscription.child.attendancePlans,
      attendanceRecords: attendance.filter((record) => record.childId === subscription.childId && periodLessons.some((lesson) => lesson.id === record.lessonId)),
      trialLessonIds: new Set(subscription.child.convertedTrials.map((trial) => trial.lessonId))
    });
    const makeupCount = -discounts.filter((discount) => discount.subscriptionId === subscription.id).reduce((sum, discount) => sum + discount.amount, 0);
    const next = calculateRecalculatedAmounts({ previousLessonsCount: subscription.plannedLessonsCount, previousTotalKopeks: subscription.totalAmountKopeks,
      unitPriceKopeks: subscription.lessonPriceKopeks,
      nextLessonsCount: ids.size, appliedMakeupCount: makeupCount });
    const label = `${subscription.periodStart.toISOString().slice(0, 7)}`;
    if (ids.size !== subscription.plannedLessonsCount) issues.push({ kind: "Абонемент не совпадает с занятиями", childName: subscription.child.fullName,
      detail: `${label}: в абонементе ${subscription.plannedLessonsCount}, по истории ${ids.size}.`, href: "/admin/billing" });
    for (const invoice of subscription.invoices) {
      const creditedKopeks = invoice.billingAdjustmentApplications.reduce((sum, application) => sum + application.amountKopeks, 0);
      const expectedInvoiceKopeks = Math.max(0, next.nextInvoiceAmountKopeks - creditedKopeks);
      if (invoice.status === "PAID" && invoice.paidAmountKopeks > next.nextInvoiceAmountKopeks && subscription.billingAdjustments.length === 0) {
        issues.push({ kind: "Оплаченный счёт уменьшился", childName: subscription.child.fullName,
          detail: `${label}, счёт ${invoice.number}: разница ${(invoice.paidAmountKopeks - next.nextInvoiceAmountKopeks) / 100} ₽ требует зачёта или возврата.`, href: "/admin/billing" });
      } else if (invoice.status !== "PAID" && invoice.amountKopeks !== expectedInvoiceKopeks) {
        issues.push({ kind: "Счёт не совпадает с занятиями", childName: subscription.child.fullName,
          detail: `${label}, счёт ${invoice.number}: ${invoice.amountKopeks / 100} ₽ вместо ${expectedInvoiceKopeks / 100} ₽ после зачётов.`, href: "/admin/billing" });
      }
    }
  }
  return issues;
}
