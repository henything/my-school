import type { BalanceTransactionType, CoachAttendanceStatus } from "@/generated/prisma/enums";

export function desiredAttendanceLessonBalanceNet(status: CoachAttendanceStatus) {
  return status === "PRESENT" || status === "ABSENT_UNEXCUSED" ? -1 : 0;
}

export function debitTransactionTypeForStatus(status: CoachAttendanceStatus): BalanceTransactionType {
  return status === "ABSENT_UNEXCUSED" ? "UNEXCUSED_ABSENCE_DEDUCTION" : "PRESENT_DEDUCTION";
}

export function attendanceBalanceDelta(status: CoachAttendanceStatus, currentNet: number) {
  return desiredAttendanceLessonBalanceNet(status) - currentNet;
}
