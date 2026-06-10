import { describe, expect, it } from "vitest";
import {
  attendanceBalanceDelta,
  debitTransactionTypeForStatus,
  desiredAttendanceLessonBalanceNet
} from "./effects";

describe("attendance balance effects", () => {
  it("deducts one lesson for present and unexcused absence", () => {
    expect(desiredAttendanceLessonBalanceNet("PRESENT")).toBe(-1);
    expect(desiredAttendanceLessonBalanceNet("ABSENT_UNEXCUSED")).toBe(-1);
  });

  it("does not deduct for not marked and sick pending", () => {
    expect(desiredAttendanceLessonBalanceNet("NOT_MARKED")).toBe(0);
    expect(desiredAttendanceLessonBalanceNet("ABSENT_SICK_PENDING")).toBe(0);
  });

  it("keeps repeated saves idempotent", () => {
    expect(attendanceBalanceDelta("PRESENT", 0)).toBe(-1);
    expect(attendanceBalanceDelta("PRESENT", -1)).toBe(0);
    expect(attendanceBalanceDelta("ABSENT_SICK_PENDING", -1)).toBe(1);
  });

  it("maps debit statuses to transaction types", () => {
    expect(debitTransactionTypeForStatus("PRESENT")).toBe("PRESENT_DEDUCTION");
    expect(debitTransactionTypeForStatus("ABSENT_UNEXCUSED")).toBe("UNEXCUSED_ABSENCE_DEDUCTION");
  });
});
