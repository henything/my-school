import { describe, expect, it } from "vitest";
import { attendanceNotFilledJobSchema, saveAttendanceSchema, updateAttendanceRecordSchema } from "./schemas";

describe("attendance schemas", () => {
  it("accepts coach attendance records", () => {
    const parsed = saveAttendanceSchema.parse({
      records: [
        {
          childId: "11111111-1111-4111-8111-111111111111",
          status: "PRESENT",
          comment: "ok"
        }
      ]
    });

    expect(parsed.records[0].status).toBe("PRESENT");
  });

  it("rejects an empty attendance sheet", () => {
    expect(() => saveAttendanceSchema.parse({ records: [] })).toThrow();
  });

  it("requires a valid attendance status on patch", () => {
    expect(() =>
      updateAttendanceRecordSchema.parse({
        status: "SICK_CONFIRMED"
      })
    ).toThrow();
  });

  it("parses optional job timestamp", () => {
    const parsed = attendanceNotFilledJobSchema.parse({ now: "2026-09-01T18:30:00.000Z" });

    expect(parsed.now).toBeInstanceOf(Date);
  });
});
