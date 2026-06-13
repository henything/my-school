import { describe, expect, it } from "vitest";
import {
  assertCanCloseMakeup,
  assertSameGroupMakeupAssignment,
  assertVacationIsNotBackdated,
  finalStatusBalanceEffectStatus,
  finalStatusStoredAttendanceStatus,
  makeupReasonForFinalStatus,
  makeupReasonForGroupEvent,
  transactionTypeForMakeupReason
} from "./rules";

describe("makeup rules", () => {
  it("creates sickness makeup transactions from confirmed sickness", () => {
    expect(makeupReasonForFinalStatus("ABSENT_SICK_CONFIRMED")).toBe("SICKNESS");
    expect(transactionTypeForMakeupReason("SICKNESS")).toBe("SICKNESS_MAKEUP_CREATED");
    expect(finalStatusBalanceEffectStatus("ABSENT_SICK_CONFIRMED")).toBe("NOT_MARKED");
    expect(finalStatusStoredAttendanceStatus("ABSENT_SICK_CONFIRMED", "ABSENT_SICK_PENDING")).toBe("ABSENT_SICK_PENDING");
  });

  it("maps vacation and group events to makeup balance transactions", () => {
    expect(makeupReasonForFinalStatus("ABSENT_VACATION_APPROVED")).toBe("VACATION");
    expect(transactionTypeForMakeupReason("VACATION")).toBe("VACATION_MAKEUP_CREATED");
    expect(makeupReasonForGroupEvent("QUARANTINE")).toBe("QUARANTINE");
    expect(transactionTypeForMakeupReason("QUARANTINE")).toBe("QUARANTINE_MAKEUP_CREATED");
    expect(makeupReasonForGroupEvent("KINDERGARTEN_EVENT")).toBe("KINDERGARTEN_EVENT");
    expect(transactionTypeForMakeupReason("KINDERGARTEN_EVENT")).toBe("EVENT_MAKEUP_CREATED");
  });

  it("does not create a makeup for final unexcused absence", () => {
    expect(makeupReasonForFinalStatus("ABSENT_UNEXCUSED_FINAL")).toBeNull();
    expect(finalStatusBalanceEffectStatus("ABSENT_UNEXCUSED_FINAL")).toBe("ABSENT_UNEXCUSED");
    expect(finalStatusStoredAttendanceStatus("ABSENT_UNEXCUSED_FINAL", "ABSENT_SICK_PENDING")).toBe("ABSENT_UNEXCUSED");
  });

  it("prevents vacation backdating", () => {
    const today = new Date("2026-06-12T00:00:00.000Z");

    expect(() => assertVacationIsNotBackdated(new Date("2026-06-11T00:00:00.000Z"), today)).toThrow(
      "Отпуск нельзя оформить задним числом."
    );
    expect(() => assertVacationIsNotBackdated(new Date("2026-06-12T00:00:00.000Z"), today)).not.toThrow();
  });

  it("prevents assigning a makeup to another group", () => {
    expect(() => assertSameGroupMakeupAssignment("group-a", "group-b")).toThrow("Перенос нельзя назначить на занятие другой группы.");
    expect(() => assertSameGroupMakeupAssignment("group-a", "group-a")).not.toThrow();
  });

  it("allows used status only for assigned makeups", () => {
    expect(() => assertCanCloseMakeup("ASSIGNED", "USED", true)).not.toThrow();
    expect(() => assertCanCloseMakeup("AVAILABLE", "USED", false)).toThrow("Использовать можно только назначенный перенос.");
    expect(() => assertCanCloseMakeup("USED", "CANCELLED", true)).toThrow("Закрытый перенос нельзя изменить.");
  });
});
