import { calculateSubscriptionInvoiceAmount } from "./calculations";
import { isLessonInChildPlan, type AttendancePlan } from "@/server/children/attendance-plan";
import { isMemberOnDate, type MembershipPeriod } from "@/server/children/group-membership";

export function countPlannedLessonsFromHistory(input: {
  lessons: Array<{ id: string; groupId: string; lessonDate: Date }>;
  memberships: Array<MembershipPeriod & { groupId: string }>;
  attendancePlans: AttendancePlan[];
  attendanceRecords: Array<{ lessonId: string; status: string }>;
  trialLessonIds: Set<string>;
}) {
  const ids = new Set(input.lessons.filter((lesson) =>
    !input.trialLessonIds.has(lesson.id) &&
    input.memberships.some((membership) => membership.groupId === lesson.groupId && isMemberOnDate(membership, lesson.lessonDate)) &&
    isLessonInChildPlan(input.attendancePlans, lesson.lessonDate)
  ).map((lesson) => lesson.id));
  for (const record of input.attendanceRecords) {
    if (!input.trialLessonIds.has(record.lessonId) && ["PRESENT", "ABSENT_UNEXCUSED"].includes(record.status)) {
      ids.add(record.lessonId);
    }
  }
  return ids.size;
}

export function recalculationBlockReason(input: {
  hasInvoice: boolean;
  activeInvoicesCount: number;
  invoiceStatus: string | null;
  paidAmountKopeks: number;
  paymentCount: number;
  attemptCount: number;
  nextLessonsCount: number;
  nextInvoiceAmountKopeks: number;
  nextBalance: number;
  unchanged: boolean;
}) {
  if (!input.hasInvoice) return "По абонементу нет действующего счёта.";
  if (input.activeInvoicesCount > 1) return "По абонементу несколько действующих счетов; нужна ручная проверка.";
  if (input.paidAmountKopeks > 0 || input.invoiceStatus === "PAID" || input.paymentCount > 0) {
    return "По счёту уже была оплата. Разницу нужно учесть возвратом или зачётом; счёт автоматически не меняется.";
  }
  if (input.attemptCount > 0 || !["DRAFT", "ISSUED", "OVERDUE"].includes(input.invoiceStatus ?? "")) {
    return "По счёту уже начата оплата или его статус не допускает автоматическое изменение.";
  }
  if (input.nextLessonsCount === 0 || input.nextInvoiceAmountKopeks === 0) {
    return "Нулевой счёт требует отдельной отмены или зачёта.";
  }
  if (input.nextBalance < -1) return "После пересчёта баланс занятий станет ниже −1; проверьте отметки посещаемости.";
  if (input.unchanged) return "Абонемент и счёт уже соответствуют расписанию.";
  return null;
}

export function calculateRecalculatedAmounts(input: {
  previousLessonsCount: number;
  previousTotalKopeks: number;
  nextLessonsCount: number;
  appliedMakeupCount: number;
}) {
  const unitPriceKopeks = input.previousLessonsCount > 0
    ? input.previousTotalKopeks / input.previousLessonsCount
    : 0;
  const nextTotalKopeks = Math.round(unitPriceKopeks * input.nextLessonsCount);
  const nextInvoiceAmountKopeks = calculateSubscriptionInvoiceAmount(
    nextTotalKopeks,
    input.nextLessonsCount,
    input.appliedMakeupCount
  );
  return { nextTotalKopeks, nextInvoiceAmountKopeks };
}
