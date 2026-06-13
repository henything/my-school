import { describe, expect, it } from "vitest";
import { createGroupEventSchema, createVacationSchema } from "./schemas";

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
      periodEnd: "2026-07-10"
    });

    expect(event.groupId).toBe("11111111-1111-4111-8111-111111111111");
    expect(event.reason).toBe("QUARANTINE");
    expect(event.periodStart).toEqual(new Date("2026-07-01T00:00:00.000Z"));
  });
});
