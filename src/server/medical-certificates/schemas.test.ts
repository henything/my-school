import { describe, expect, it } from "vitest";
import { createMedicalCertificateSchema, reviewMedicalCertificateSchema } from "./schemas";

describe("medical certificate schemas", () => {
  it("accepts a valid certificate upload payload", () => {
    const result = createMedicalCertificateSchema.parse({
      childId: "11111111-1111-4111-8111-111111111111",
      attendanceRecordId: null,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-05",
      comment: "Температура"
    });

    expect(result.periodStart).toBeInstanceOf(Date);
    expect(result.comment).toBe("Температура");
  });

  it("rejects an invalid period", () => {
    expect(() =>
      createMedicalCertificateSchema.parse({
        childId: "11111111-1111-4111-8111-111111111111",
        periodStart: "2026-09-05",
        periodEnd: "2026-09-01"
      })
    ).toThrow("Дата окончания должна быть не раньше даты начала.");
  });

  it("requires admin comment when certificate is rejected", () => {
    expect(() => reviewMedicalCertificateSchema.parse({ status: "REJECTED", adminComment: "" })).toThrow(
      "Укажите комментарий при отклонении справки."
    );
  });
});
