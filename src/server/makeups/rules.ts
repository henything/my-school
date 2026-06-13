import type {
  AdminFinalAttendanceStatus,
  BalanceTransactionType,
  CoachAttendanceStatus,
  LessonChangeReason,
  MakeupReason,
  MakeupStatus
} from "@/generated/prisma/enums";
import { dateToKey } from "@/server/schedule/generation";

export function makeupReasonForFinalStatus(status: AdminFinalAttendanceStatus): MakeupReason | null {
  switch (status) {
    case "ABSENT_SICK_CONFIRMED":
      return "SICKNESS";
    case "ABSENT_VACATION_APPROVED":
      return "VACATION";
    case "ABSENT_QUARANTINE":
      return "QUARANTINE";
    case "ABSENT_EVENT":
      return "KINDERGARTEN_EVENT";
    case "ABSENT_UNEXCUSED_FINAL":
      return null;
  }
}

export function makeupReasonForGroupEvent(reason: LessonChangeReason): MakeupReason {
  return reason;
}

export function transactionTypeForMakeupReason(reason: MakeupReason): BalanceTransactionType {
  if (reason === "SICKNESS") {
    return "SICKNESS_MAKEUP_CREATED";
  }

  if (reason === "VACATION") {
    return "VACATION_MAKEUP_CREATED";
  }

  if (reason === "QUARANTINE") {
    return "QUARANTINE_MAKEUP_CREATED";
  }

  return "EVENT_MAKEUP_CREATED";
}

export function finalStatusBalanceEffectStatus(status: AdminFinalAttendanceStatus): CoachAttendanceStatus {
  return status === "ABSENT_UNEXCUSED_FINAL" ? "ABSENT_UNEXCUSED" : "NOT_MARKED";
}

export function finalStatusStoredAttendanceStatus(
  finalStatus: AdminFinalAttendanceStatus,
  currentStatus: CoachAttendanceStatus
): CoachAttendanceStatus {
  if (finalStatus === "ABSENT_UNEXCUSED_FINAL") {
    return "ABSENT_UNEXCUSED";
  }

  if (finalStatus === "ABSENT_SICK_CONFIRMED") {
    return currentStatus;
  }

  return "NOT_MARKED";
}

export function assertVacationIsNotBackdated(periodStart: Date, today: Date) {
  if (dateToKey(periodStart) < dateToKey(today)) {
    throw new Error("Отпуск нельзя оформить задним числом.");
  }
}

export function assertSameGroupMakeupAssignment(makeupGroupId: string, lessonGroupId: string) {
  if (makeupGroupId !== lessonGroupId) {
    throw new Error("Перенос нельзя назначить на занятие другой группы.");
  }
}

export function assertCanCloseMakeup(currentStatus: MakeupStatus, nextStatus: MakeupStatus, hasAssignedLesson: boolean) {
  if (currentStatus === "USED" || currentStatus === "REFUNDED" || currentStatus === "CANCELLED") {
    throw new Error("Закрытый перенос нельзя изменить.");
  }

  if (nextStatus === "USED" && (!hasAssignedLesson || currentStatus !== "ASSIGNED")) {
    throw new Error("Использовать можно только назначенный перенос.");
  }

  if (nextStatus !== "USED" && nextStatus !== "REFUNDED" && nextStatus !== "CANCELLED") {
    throw new Error("Недопустимый финальный статус переноса.");
  }
}
