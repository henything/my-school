import { describe, expect, it } from "vitest";
import { cancelLessonSchema, createScheduleTemplateSchema, generateAcademicYearSchema, moveLessonSchema } from "./schemas";

describe("schedule schemas", () => {
  it("requires weekday and start time for templates", () => {
    expect(() =>
      createScheduleTemplateSchema.parse({
        groupId: "11111111-1111-4111-8111-111111111111",
        endTime: "11:00"
      })
    ).toThrow();
  });

  it("rejects time ranges where end is not after start", () => {
    expect(() =>
      createScheduleTemplateSchema.parse({
        groupId: "11111111-1111-4111-8111-111111111111",
        weekday: 1,
        startTime: "11:00",
        endTime: "10:00"
      })
    ).toThrow();
  });

  it("requires a reason when moving a lesson", () => {
    expect(() =>
      moveLessonSchema.parse({
        lessonDate: "2026-06-10",
        startTime: "10:00",
        endTime: "11:00"
      })
    ).toThrow();
  });

  it("accepts an academic year generation request", () => {
    const input = generateAcademicYearSchema.parse({
      academicYearStart: "2026",
      groupId: "11111111-1111-4111-8111-111111111111"
    });

    expect(input.academicYearStart).toBe(2026);
  });

  it("requires a reason when cancelling a lesson", () => {
    expect(() => cancelLessonSchema.parse({ comment: "Нет доступа в зал" })).toThrow();
  });

  it("requires comments when moving or cancelling a lesson", () => {
    expect(
      moveLessonSchema.safeParse({
        lessonDate: "2026-06-10",
        startTime: "10:00",
        endTime: "11:00",
        reason: "OTHER",
        comment: "Перенос по просьбе сада"
      }).success
    ).toBe(true);
    expect(
      moveLessonSchema.safeParse({
        lessonDate: "2026-06-10",
        startTime: "10:00",
        endTime: "11:00",
        reason: "OTHER",
        comment: " "
      }).success
    ).toBe(false);
    expect(cancelLessonSchema.safeParse({ reason: "QUARANTINE", comment: "Карантин в группе" }).success).toBe(true);
    expect(cancelLessonSchema.safeParse({ reason: "QUARANTINE", comment: "" }).success).toBe(false);
  });
});
