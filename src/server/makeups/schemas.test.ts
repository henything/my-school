import { describe, expect, it } from "vitest";
import { assignMakeupSchema, closeMakeupSchema, createGroupEventSchema, createVacationSchema } from "./schemas";

describe("makeup schemas", () => {
  it("rejects vacation periods where the end is before the start", () => {
    expect(() =>
      createVacationSchema.parse({
        periodStart: "2026-07-10",
        periodEnd: "2026-07-01"
      })
    ).toThrow("Дата окончания отпуска должна быть не раньше даты начала.");
  });

  it("does not keep certificate or vacation statement file fields", () => {
    const vacation = createVacationSchema.parse({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-10",
      certificateFile: "outside-system.pdf",
      vacationStatementFile: "outside-system.pdf"
    });

    expect("certificateFile" in vacation).toBe(false);
    expect("vacationStatementFile" in vacation).toBe(false);
  });

  it("keeps group events scoped to one group and a period", () => {
    const event = createGroupEventSchema.parse({
      groupId: "11111111-1111-4111-8111-111111111111",
      reason: "QUARANTINE",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-10",
      comment: "Карантин по уведомлению сада"
    });

    expect(event.groupId).toBe("11111111-1111-4111-8111-111111111111");
    expect(event.reason).toBe("QUARANTINE");
    expect(event.periodStart).toEqual(new Date("2026-07-01T00:00:00.000Z"));
  });

  it("requires comments for group events and manual makeup operations", () => {
    expect(
      createGroupEventSchema.safeParse({
        groupId: "11111111-1111-4111-8111-111111111111",
        reason: "OTHER",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-10",
        comment: ""
      }).success
    ).toBe(false);
    expect(
      assignMakeupSchema.safeParse({
        assignedLessonId: "11111111-1111-4111-8111-111111111111",
        comment: "Назначено вручную после согласования"
      }).success
    ).toBe(true);
    expect(closeMakeupSchema.safeParse({ status: "CANCELLED", comment: " " }).success).toBe(false);
    expect(closeMakeupSchema.safeParse({ status: "USED", comment: "Отработка проведена" }).success).toBe(true);
  });
});
