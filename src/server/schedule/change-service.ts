import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { writeAuditLog } from "@/server/audit/audit-service";
import { todayInMoscow } from "@/server/children/attendance-plan";
import { ensureCurrentMonthSubscriptionForChild } from "@/server/billing/billing-service";
import { applyRecalculationInTransaction, getRecalculationPreviewInTransaction } from "@/server/billing/recalculation-service";
import { buildLessonCandidates, dateToKey } from "./generation";
import { incompatiblePlans, lessonKey, scheduleHorizon } from "./change-rules";
import type { ScheduleChangeInput } from "./change-schema";

type BillChange = { childName: string; month: string; beforeKopeks: number | null; afterKopeks: number | null;
  creditKopeks: number; beforeLessons: number | null; afterLessons: number | null; action: string; warning: string | null };
export type ScheduleChangePreview = {
  fingerprint: string; groupName: string; effectiveFrom: string; through: string;
  cancelled: Array<{ date: string; time: string }>; created: Array<{ date: string; time: string }>;
  preserved: Array<{ date: string; time: string }>;
  planChoices: ReturnType<typeof incompatiblePlans>; blockers: string[]; bills: BillChange[];
  manualTaskCount: number; applied: boolean;
  manualTasks: string[];
};
class PreviewRollback extends Error { constructor(readonly preview: ScheduleChangePreview) { super("PREVIEW_ONLY"); } }

/** Preview uses the same transactional changes and calculators as apply, then rolls back. */
export async function changeGroupSchedule(user: CurrentUser, input: ScheduleChangeInput): Promise<ScheduleChangePreview> {
  assertRole(user, ADMIN_ROLES);
  try {
    return await getPrisma().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM groups WHERE id=${input.groupId}::uuid AND school_id=${user.schoolId}::uuid FOR UPDATE`;
      const group = await tx.trainingGroup.findFirstOrThrow({ where: { id: input.groupId, schoolId: user.schoolId, status: { not: "ARCHIVED" }, branch: { status: { not: "ARCHIVED" } } } });
      const start = new Date(`${input.effectiveFrom}T00:00:00Z`);
      const templates = await tx.scheduleTemplate.findMany({ where: { groupId: group.id }, orderBy: { id: "asc" } });
      const lessons = await tx.lesson.findMany({ where: { groupId: group.id, lessonDate: { gte: start } }, orderBy: { id: "asc" },
        include: { attendanceRecords: { orderBy: { id: "asc" } }, trialParticipants: { orderBy: { id: "asc" }, select: { id: true, status: true, updatedAt: true } } } });
      await tx.$queryRaw`SELECT id FROM children WHERE current_group_id=${group.id}::uuid ORDER BY id FOR UPDATE`;
      const children = await tx.child.findMany({ where: { currentGroupId: group.id, status: { notIn: ["LEFT", "ARCHIVED"] } }, orderBy: { id: "asc" },
        include: { attendancePlans: { orderBy: { effectiveFrom: "asc" } }, groupMemberships: { orderBy: { id: "asc" } },
          parent: { select: { id: true, benefitStatus: true, benefitCategory: true, updatedAt: true } },
          makeupCredits: { orderBy: { id: "asc" }, select: { id: true, status: true, updatedAt: true } } } });
      await tx.$queryRaw`SELECT id FROM subscriptions WHERE group_id=${group.id}::uuid AND period_end>=${start} ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT i.id FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id WHERE s.group_id=${group.id}::uuid AND s.period_end>=${start} ORDER BY i.id FOR UPDATE OF i`;
      const subscriptions = await tx.subscription.findMany({ where: { schoolId: user.schoolId, groupId: group.id, periodEnd: { gte: start } }, orderBy: { id: "asc" },
        include: { invoices: { orderBy: { id: "asc" }, include: { attempts: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } }, billingAdjustmentApplications: { orderBy: { id: "asc" } } } },
          billingAdjustments: { orderBy: { id: "asc" } }, lessonSnapshots: { orderBy: { id: "asc" } } } });
      const childIds = Array.from(new Set([...children.map(c => c.id), ...subscriptions.map(s => s.childId)]));
      const credits = await tx.billingAdjustment.findMany({ where: { childId: { in: childIds }, schoolId: user.schoolId }, orderBy: { id: "asc" } });
      const financialChildren = await tx.child.findMany({ where: { id: { in: childIds }, schoolId: user.schoolId }, orderBy: { id: "asc" },
        include: { groupMemberships: { orderBy: { id: "asc" } }, attendancePlans: { orderBy: { effectiveFrom: "asc" } }, convertedTrials: { orderBy: { id: "asc" }, select: { id: true, lessonId: true, updatedAt: true } } } });
      const financialStart = new Date(Math.min(start.getTime(), ...subscriptions.map(s => s.periodStart.getTime())));
      const financialEnd = new Date(Math.max(start.getTime(), ...subscriptions.map(s => s.periodEnd.getTime())));
      const financialGroups = Array.from(new Set(financialChildren.flatMap(c => c.groupMemberships.map(m => m.groupId))));
      const financialLessons = await tx.lesson.findMany({ where: { schoolId: user.schoolId, groupId: { in: financialGroups }, lessonDate: { gte: financialStart, lte: financialEnd } },
        orderBy: { id: "asc" }, include: { attendanceRecords: { where: { childId: { in: childIds } }, orderBy: { id: "asc" } } } });
      const financialDiscounts = await tx.lessonBalanceTransaction.findMany({ where: { subscriptionId: { in: subscriptions.map(s => s.id) }, type: "MAKEUP_USED", reason: "INVOICE_DISCOUNT" }, orderBy: { id: "asc" } });
      const fingerprint = createHash("sha256").update(JSON.stringify({ group, templates, lessons, children, subscriptions, credits, financialChildren, financialLessons, financialDiscounts,
        request: { groupId: input.groupId, effectiveFrom: input.effectiveFrom, slots: input.slots, plans: input.plans, reason: input.reason } })).digest("hex");
      if (input.action === "apply" && input.fingerprint !== fingerprint) throw new Error("Расписание, табели или счета изменились. Получите новый предварительный расчёт.");
      const through = scheduleHorizon(start, lessons.map(l => l.lessonDate));
      if (through.getTime() - start.getTime() > 366 * 86400000 * 3) throw new Error("Слишком большой период расписания. Проверьте даты занятий группы.");
      const result: ScheduleChangePreview = { fingerprint, groupName: group.name, effectiveFrom: input.effectiveFrom,
        through: dateToKey(through), cancelled: [], created: [], preserved: [], planChoices: incompatiblePlans(children, start, input.slots), blockers: [], bills: [], manualTaskCount: 0, manualTasks: [], applied: false };
      const requiredKeys = new Set(result.planChoices.map(p => `${p.childId}:${p.effectiveFrom}`));
      const provided = new Set<string>();
      for (const choice of input.plans) {
        const key = `${choice.childId}:${choice.effectiveFrom}`;
        if (!requiredKeys.has(key) || provided.has(key) || (choice.weekday !== null && !input.slots.some(s => s.weekday === choice.weekday))) {
          throw new Error("Проверьте новые дни посещения детей.");
        }
        provided.add(key);
      }
      for (const choice of result.planChoices) {
        if (!provided.has(`${choice.childId}:${choice.effectiveFrom}`)) result.blockers.push(`${choice.childName}: выберите новый график с ${choice.effectiveFrom} вместо удалённого дня.`);
      }
      if (result.blockers.length) throw new PreviewRollback(result);
      for (const plan of input.plans) await tx.childAttendancePlan.upsert({
        where: { childId_effectiveFrom: { childId: plan.childId, effectiveFrom: new Date(`${plan.effectiveFrom}T00:00:00Z`) } },
        create: { childId: plan.childId, effectiveFrom: new Date(`${plan.effectiveFrom}T00:00:00Z`), weekday: plan.weekday }, update: { weekday: plan.weekday }
      });
      for (const template of templates.filter(t => t.status === "ACTIVE" && (!t.validUntil || t.validUntil > start))) {
        if (template.validFrom && template.validFrom >= start) {
          await tx.scheduleTemplate.update({ where: { id: template.id }, data: { status: "ARCHIVED" } });
        } else await tx.scheduleTemplate.update({ where: { id: template.id }, data: { validUntil: start } });
      }
      const newTemplates = [];
      for (const slot of input.slots) newTemplates.push(await tx.scheduleTemplate.create({ data: {
        schoolId: user.schoolId, groupId: group.id, branchId: group.branchId, coachId: group.mainCoachId, ...slot, validFrom: start
      } }));
      const candidates = [];
      for (let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); cursor <= through; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
        candidates.push(...buildLessonCandidates(newTemplates, dateToKey(cursor).slice(0, 7)).filter(l => l.lessonDate <= through));
      }
      const desired = new Map(candidates.map(l => [lessonKey(l), l]));
      for (const lesson of lessons) {
        const wanted = desired.get(lessonKey(lesson));
        const protectedLesson = lesson.attendanceRecords.length > 0 || lesson.status === "ATTENDANCE_COMPLETED";
        if (lesson.status === "CANCELLED") continue; // Explicit cancellations stay cancelled, including holidays/quarantine.
        if (wanted && lesson.endTime === wanted.endTime) {
          await tx.lesson.update({ where: { id: lesson.id }, data: { scheduleTemplateId: wanted.scheduleTemplateId } });
          continue;
        }
        if (protectedLesson) { result.preserved.push({ date: dateToKey(lesson.lessonDate), time: lesson.startTime }); continue; }
        if (lesson.trialParticipants.length) {
          result.blockers.push(`${dateToKey(lesson.lessonDate)} ${lesson.startTime}: есть запись на пробное. Сначала перенесите заявку.`);
          continue;
        }
        result.cancelled.push({ date: dateToKey(lesson.lessonDate), time: lesson.startTime });
        await tx.lesson.update({ where: { id: lesson.id }, data: { status: "CANCELLED", changeReason: "OTHER", changeComment: input.reason } });
      }
      if (result.blockers.length) throw new PreviewRollback(result);
      for (const candidate of candidates) {
        const existing = lessons.find(l => lessonKey(l) === lessonKey(candidate));
        if (existing && existing.status !== "CANCELLED" && existing.endTime === candidate.endTime) continue;
        if (existing && (existing.status === "CANCELLED" || existing.attendanceRecords.length || existing.trialParticipants.length)) continue;
        if (existing) {
          await tx.lesson.update({ where: { id: existing.id }, data: { status: "SCHEDULED", endTime: candidate.endTime,
            scheduleTemplateId: candidate.scheduleTemplateId, changeReason: "OTHER", changeComment: input.reason } });
        } else await tx.lesson.create({ data: { schoolId: user.schoolId, ...candidate } });
        result.created.push({ date: dateToKey(candidate.lessonDate), time: candidate.startTime });
      }
      const manual: Array<{ childId: string; description: string }> = [];
      for (const subscription of subscriptions) {
        const preview = await getRecalculationPreviewInTransaction(tx, user, subscription.id);
        const changed = preview.previousLessonsCount !== preview.nextLessonsCount || preview.previousTotalKopeks !== preview.nextTotalKopeks ||
          preview.lessonSnapshotChanged || preview.additionalCreditKopeks > 0 ||
          ((preview.invoiceStatus !== "PAID" || preview.creditSettledWithoutCash) && preview.previousInvoiceAmountKopeks !== preview.nextInvoiceAmountKopeks);
        if (!changed) continue;
        const safe = preview.canApply || preview.canApplyPaid || preview.canRefreshScheduleOnly;
        result.bills.push({ childName: preview.childName, month: preview.periodStart.slice(0, 7), beforeKopeks: preview.previousInvoiceAmountKopeks,
          afterKopeks: preview.canApply ? preview.nextInvoiceAmountKopeks : preview.previousInvoiceAmountKopeks,
          creditKopeks: safe ? preview.additionalCreditKopeks : 0, beforeLessons: preview.previousLessonsCount, afterLessons: preview.nextLessonsCount,
          action: preview.canApplyPaid ? "Зачёт на следующий месяц" : preview.canRefreshScheduleOnly ? "Обновление состава занятий без изменения счёта" : safe ? "Пересчёт счёта" : "Проверка администратором",
          warning: safe ? null : `${preview.blockReason ?? "Проверьте расчёт"} Расчётная сумма: ${preview.nextInvoiceAmountKopeks / 100} ₽.` });
        if (safe) await applyRecalculationInTransaction(tx, user, subscription.id, { reason: input.reason, paidDifferenceAction: "CREDIT",
          expectedLessonIds: preview.nextLessons.map(l => l.id), expectedSubscriptionUpdatedAt: preview.subscriptionUpdatedAt,
          expectedInvoiceUpdatedAt: preview.invoiceUpdatedAt! });
        else manual.push({ childId: subscription.childId, description: `${preview.childName}, ${preview.periodStart.slice(0, 7)}: ${result.bills.at(-1)!.warning}` });
      }
      const today = todayInMoscow();
      const currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const currentEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      if (start <= currentEnd) for (const child of children.filter(c => c.status === "ACTIVE")) {
        const existing = await tx.subscription.findFirst({ where: { childId: child.id, periodStart: { lte: currentEnd }, periodEnd: { gte: currentStart } } });
        if (existing) continue;
        const pending = await tx.attendanceRecord.count({ where: { childId: child.id, status: "ABSENT_SICK_PENDING", finalStatus: null, lesson: { lessonDate: { lt: currentStart } } } });
        if (!child.parentId || pending) {
          manual.push({ childId: child.id, description: `${child.fullName}: ${pending ? "не разобраны справки прошлого месяца" : "нет карточки родителя"}; счёт не создан.` });
          continue;
        }
        const created = await ensureCurrentMonthSubscriptionForChild(tx, user, child.id, currentStart);
        if (!created) { manual.push({ childId: child.id, description: `${child.fullName}: нет оплачиваемых занятий; проверьте дату начала.` }); continue; }
        const invoice = await tx.invoice.findFirstOrThrow({ where: { subscriptionId: created.id } });
        result.bills.push({ childName: child.fullName, month: dateToKey(currentStart).slice(0, 7), beforeKopeks: null,
          afterKopeks: invoice.amountKopeks, creditKopeks: 0, beforeLessons: null, afterLessons: created.plannedLessonsCount, action: "Новый счёт", warning: null });
      }
      result.manualTaskCount = manual.length;
      result.manualTasks = manual.map(issue => issue.description);
      if (input.action === "preview") throw new PreviewRollback(result);
      if (manual.length && !input.acknowledgeManualTasks) throw new Error("Подтвердите сохранение с задачами администратора или сначала устраните финансовые ограничения.");
      for (const childId of new Set(manual.map(issue => issue.childId))) {
        await createManualBillingTask(tx, user, group.id, childId, manual.filter(issue => issue.childId === childId).map(issue => issue.description).join("\n"));
      }
      await writeAuditLog({ schoolId: user.schoolId, actorUserId: user.id, action: "GROUP_SCHEDULE_CHANGED", entityType: "TrainingGroup", entityId: group.id,
        oldValue: { templates: templates.map(t => ({ id: t.id, weekday: t.weekday, startTime: t.startTime, endTime: t.endTime })) },
        newValue: { effectiveFrom: input.effectiveFrom, through: result.through, slots: input.slots, plans: input.plans,
          cancelled: result.cancelled, created: result.created, preserved: result.preserved, bills: result.bills, manualTaskCount: manual.length }, comment: input.reason }, tx);
      return { ...result, applied: true };
    }, { timeout: 120_000, isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof PreviewRollback) {
      if (input.action === "apply") throw new Error(error.preview.blockers.join(" ") || "Получите новый предварительный расчёт.");
      return error.preview;
    }
    throw error;
  }
}

async function createManualBillingTask(tx: Prisma.TransactionClient, user: CurrentUser, groupId: string, childId: string, description: string) {
  const existing = await tx.task.findFirst({ where: { schoolId: user.schoolId, type: "BILLING_RECONCILIATION_REQUIRED", relatedEntityType: "ScheduleChange", childId, groupId, status: { in: ["OPEN", "IN_PROGRESS"] } } });
  const data = { description, assigneeUserId: user.id, dueAt: new Date(Date.now() + 86400000), priority: "HIGH" as const };
  if (existing) await tx.task.update({ where: { id: existing.id }, data });
  else await tx.task.create({ data: { ...data, schoolId: user.schoolId, type: "BILLING_RECONCILIATION_REQUIRED", relatedEntityType: "ScheduleChange", relatedEntityId: childId,
    groupId, childId, title: "Проверить счёт после смены расписания" } });
}
