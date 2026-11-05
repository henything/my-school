import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { todayInMoscow, weekdayForDate, weekdayForLesson, type AttendancePlan } from "@/server/children/attendance-plan";
import { finalizeAttendanceInTransaction } from "@/server/makeups/makeup-service";
import { ensureMonthlySubscriptionsForGroup } from "./billing-service";
import { getRecalculationPreview } from "./recalculation-service";

export const resolveBillingSicknessSchema = z.object({
  finalStatus: z.enum(["ABSENT_SICK_CONFIRMED", "ABSENT_UNEXCUSED_FINAL"]),
  comment: z.string().trim().min(1, "Укажите основание решения.").max(2000)
});

export type BillingControlItem = {
  id: string; kind: "MISSING_INVOICE" | "MISMATCH" | "INVALID_WEEKDAY" | "PENDING_CERTIFICATE";
  childId: string; groupId?: string; childName: string; groupName: string; detail: string; href: string;
  assignee: string; dueAt: string; overdue: boolean; attendanceRecordId?: string;
};

export function incompatibleWeekday(plans: AttendancePlan[], lessons: { lessonDate: Date }[], today: Date) {
  const weekday = weekdayForLesson(plans, today);
  return weekday !== null && !lessons.some((lesson) => weekdayForDate(lesson.lessonDate) === weekday) ? weekday : null;
}

export async function getBillingControl(currentUser: CurrentUser, tx?: Prisma.TransactionClient) {
  assertRole(currentUser, ADMIN_ROLES);
  const prisma = tx ?? getPrisma();
  const today = todayInMoscow();
  const month = today.toISOString().slice(0, 7);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const [children, pending, tasks, admin] = await Promise.all([
    prisma.child.findMany({
      where: { schoolId: currentUser.schoolId, status: "ACTIVE" },
      include: {
        currentGroup: { select: { name: true, lessons: { where: { lessonDate: { gte: start, lte: end }, status: { not: "CANCELLED" } }, select: { lessonDate: true } } } },
        invoices: { where: { periodStart: { lte: end }, periodEnd: { gte: start } }, select: { status: true, amountKopeks: true } },
        attendancePlans: { select: { effectiveFrom: true, weekday: true } },
        subscriptions: { where: { periodStart: { lte: end }, periodEnd: { gte: start } }, select: { id: true, invoices: { select: { id: true, status: true, amountKopeks: true } } } }
      }, orderBy: { fullName: "asc" }
    }),
    prisma.attendanceRecord.findMany({
      where: { status: "ABSENT_SICK_PENDING", finalStatus: null, lesson: { schoolId: currentUser.schoolId } },
      include: { child: { select: { fullName: true } }, lesson: { select: { id: true, groupId: true, lessonDate: true, group: { select: { name: true } } } } },
      orderBy: { lesson: { lessonDate: "asc" } }
    }),
    prisma.task.findMany({ where: { schoolId: currentUser.schoolId, status: { in: ["OPEN", "IN_PROGRESS"] }, type: { in: ["BILLING_RECONCILIATION_REQUIRED", "CERTIFICATE_PENDING", "SICKNESS_FOLLOW_UP"] } }, include: { assigneeUser: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.user.findFirst({ where: { schoolId: currentUser.schoolId, status: "ACTIVE", role: { in: ADMIN_ROLES } }, orderBy: { createdAt: "asc" }, select: { id: true, displayName: true } })
  ]);
  const items: BillingControlItem[] = [];
  function responsibility(childId: string, recordId?: string, date = start) {
    const task = tasks.find((task) => recordId ? task.relatedEntityId === recordId : task.childId === childId && task.type === "BILLING_RECONCILIATION_REQUIRED");
    // Seven days is the existing medical follow-up window. Invoice reconciliation is due on the third day of the month.
    const due = task?.dueAt ?? new Date(date.getTime() + (recordId ? 7 : 2) * 86400000);
    return { assignee: task?.assigneeUser?.displayName ?? admin?.displayName ?? "Администратор не назначен", dueAt: due.toISOString(), overdue: due.toISOString().slice(0, 10) < today.toISOString().slice(0, 10) };
  }
  for (const child of children) {
    const base = { childId: child.id, groupId: child.currentGroupId ?? undefined, childName: child.fullName, groupName: child.currentGroup?.name ?? "Без группы", ...responsibility(child.id) };
    const invoices = [...child.invoices, ...child.subscriptions.flatMap((subscription) => subscription.invoices)];
    if (!invoices.some((invoice) => invoice.status !== "CANCELLED" || invoice.amountKopeks === 0)) {
      items.push({ ...base, id: `missing-${child.id}`, kind: "MISSING_INVOICE", detail: child.currentGroup ? "За текущий месяц нет действующего счёта. Проверьте справки, участие в группе и начисления." : "Активный ребёнок без группы: проверьте карточку до начисления.", href: "/admin/billing" });
    }
    const weekday = incompatibleWeekday(child.attendancePlans, child.currentGroup?.lessons ?? [], today);
    if (weekday !== null) items.push({ ...base, id: `weekday-${child.id}`, kind: "INVALID_WEEKDAY", detail: `Индивидуальный день «${["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"][weekday]}» отсутствует в расписании текущего месяца. Измените график ребёнка.`, href: "/admin/directories" });
    for (const subscription of child.subscriptions) {
      try {
        const preview = await getRecalculationPreview(currentUser, subscription.id, prisma);
        const expected = preview.nextInvoiceAmountKopeks;
        const invoiceNeedsReview = preview.previousInvoiceAmountKopeks !== null && preview.previousInvoiceAmountKopeks !== expected &&
          (preview.invoiceStatus !== "PAID" || preview.creditSettledWithoutCash || preview.additionalCreditKopeks > 0 || preview.canApplyPaid);
        if (preview.lessonSnapshotChanged || preview.previousLessonsCount !== preview.nextLessonsCount || preview.previousTotalKopeks !== preview.nextTotalKopeks || invoiceNeedsReview) {
          items.push({ ...base, id: `mismatch-${subscription.id}`, kind: "MISMATCH", detail: `Занятий в абонементе: ${preview.previousLessonsCount}; по расписанию: ${preview.nextLessonsCount}. Сумма счёта: ${preview.previousInvoiceAmountKopeks === null ? "не выставлен" : new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(preview.previousInvoiceAmountKopeks / 100)}; расчёт по расписанию с зачётами: ${new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(expected / 100)}. ${preview.blockReason ?? "Откройте предварительный пересчёт перед изменением счёта."}`, href: "/admin/billing" });
        }
      } catch {
        items.push({ ...base, id: `check-${subscription.id}`, kind: "MISMATCH", detail: "Не удалось проверить начисление. Откройте абонемент для ручной проверки.", href: "/admin/billing" });
      }
    }
  }
  for (const record of pending) items.push({
    id: `certificate-${record.id}`, kind: "PENDING_CERTIFICATE", attendanceRecordId: record.id,
    childId: record.childId, groupId: record.lesson.groupId, childName: record.child.fullName, groupName: record.lesson.group.name,
    detail: `Болезнь за ${record.lesson.lessonDate.toISOString().slice(0, 10)}. Подтвердите основание или явно признайте обычным платным пропуском.`,
    href: "/admin/makeups", ...responsibility(record.childId, record.id, record.markedAt ?? record.createdAt)
  });
  return { month, items: items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueAt.localeCompare(b.dueAt)) };
}

export async function resolveBillingSickness(currentUser: CurrentUser, attendanceRecordId: string, rawInput: unknown) {
  assertRole(currentUser, ADMIN_ROLES);
  const input = resolveBillingSicknessSchema.parse(rawInput);
  const prisma = getPrisma();
  const result = await prisma.$transaction(async (tx) => {
    const initial = await tx.attendanceRecord.findFirst({ where: { id: attendanceRecordId, lesson: { schoolId: currentUser.schoolId } }, select: { childId: true } });
    if (!initial) throw new Error("Отметка не найдена.");
    await tx.$queryRaw`SELECT "id" FROM "children" WHERE "id" = ${initial.childId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "attendance_records" WHERE "id" = ${attendanceRecordId}::uuid FOR UPDATE`;
    const record = await tx.attendanceRecord.findFirstOrThrow({ where: { id: attendanceRecordId, lesson: { schoolId: currentUser.schoolId } }, include: { lesson: { select: { groupId: true } } } });
    if (record.finalStatus === input.finalStatus) return { alreadyResolved: true, groupId: record.lesson.groupId };
    if (record.status !== "ABSENT_SICK_PENDING" || record.finalStatus !== null) throw new Error("Отметка уже изменена. Обновите страницу и проверьте табель.");
    await finalizeAttendanceInTransaction(tx, currentUser, attendanceRecordId, input);
    return { alreadyResolved: false, groupId: record.lesson.groupId };
  }, { timeout: 20000 });
  // Standard generator is idempotent and scoped to this group. A later retry can safely finish reconciliation.
  try {
    const reconciliation = await ensureMonthlySubscriptionsForGroup(currentUser, todayInMoscow().toISOString().slice(0, 7), result.groupId);
    return { ...result, reconciliation, warning: null };
  } catch {
    return { ...result, reconciliation: null, warning: "Решение сохранено. Не удалось завершить сверку счетов группы; запустите проверку в операционном центре." };
  }
}

/** Daily persistent reminders. Reading the panel never creates or reopens tasks. */
export async function syncBillingControlTasks(currentUser: CurrentUser) {
  assertRole(currentUser, ADMIN_ROLES);
  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${currentUser.schoolId}::text), hashtext('BillingControl'::text))`;
    const { month, items } = await getBillingControl(currentUser, tx);
    const entityType = `BillingControl:${month}`;
    const [existingTasks, admins] = await Promise.all([
      tx.task.findMany({
        where: { schoolId: currentUser.schoolId, type: "BILLING_RECONCILIATION_REQUIRED", relatedEntityType: { startsWith: "BillingControl:" } },
        orderBy: { createdAt: "asc" }
      }),
      tx.user.findMany({ where: { schoolId: currentUser.schoolId, status: "ACTIVE", role: { in: ADMIN_ROLES } }, orderBy: { createdAt: "asc" }, select: { id: true } })
    ]);
    const activeAdminIds = new Set(admins.map((admin) => admin.id));
    if (items.length && admins.length === 0) throw new Error("Для контроля начислений нужен действующий администратор школы.");
    const grouped = new Map<string, BillingControlItem[]>();
    for (const item of items) grouped.set(item.childId, [...(grouped.get(item.childId) ?? []), item]);
    const retained = new Set<string>();
    let createdCount = 0;
    let updatedCount = 0;
    let reopenedCount = 0;
    let closedCount = 0;
    const todayKey = todayInMoscow().toISOString().slice(0, 10);
    for (const [childId, reasons] of grouped) {
      const existing = existingTasks.find((task) => task.relatedEntityType === entityType && task.relatedEntityId === childId);
      const earliestDue = reasons.reduce((earliest, item) => item.dueAt < earliest ? item.dueAt : earliest, reasons[0].dueAt);
      const dueAt = existing?.dueAt && existing.dueAt.toISOString() <= earliestDue ? existing.dueAt : new Date(earliestDue);
      const data = {
        schoolId: currentUser.schoolId,
        type: "BILLING_RECONCILIATION_REQUIRED" as const,
        relatedEntityType: entityType,
        relatedEntityId: childId,
        childId,
        groupId: reasons[0].groupId ?? null,
        title: `Проверить начисления: ${reasons[0].childName}`,
        description: `${reasons[0].groupName}. Период: ${month}.\n${reasons.map((item) => `• ${item.detail}`).join("\n")}\nКонтроль: /admin/billing. Задача остаётся до устранения причин; ручное закрытие не устраняет расхождение.`,
        assigneeUserId: existing?.assigneeUserId && activeAdminIds.has(existing.assigneeUserId) ? existing.assigneeUserId : admins[0].id,
        dueAt,
        priority: dueAt.toISOString().slice(0, 10) < todayKey ? "CRITICAL" as const : "HIGH" as const,
        status: existing?.status === "IN_PROGRESS" ? "IN_PROGRESS" as const : "OPEN" as const,
        closedAt: null, closedByUserId: null, closedComment: null
      };
      if (existing) {
        await tx.task.update({ where: { id: existing.id }, data });
        retained.add(existing.id);
        updatedCount += 1;
        if (existing.status === "CLOSED" || existing.status === "CANCELLED") reopenedCount += 1;
      } else {
        const created = await tx.task.create({ data });
        retained.add(created.id);
        createdCount += 1;
      }
    }
    // Clear prior months and duplicate reminders as well as resolved current-month causes.
    for (const task of existingTasks) {
      if (!retained.has(task.id) && (task.status === "OPEN" || task.status === "IN_PROGRESS")) {
        await tx.task.update({ where: { id: task.id }, data: { status: "CLOSED", closedAt: new Date(), closedByUserId: currentUser.id, closedComment: task.relatedEntityType === entityType ? "Контроль начислений: причина устранена либо объединена в основную задачу." : "Контроль перенесён в текущий расчётный месяц." } });
        closedCount += 1;
      }
    }
    return { month, issueCount: items.length, childrenCount: grouped.size, createdCount, updatedCount, reopenedCount, closedCount };
  }, { timeout: 60000 });
}
