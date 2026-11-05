import { describe, expect, it } from "vitest";
import { isTemplateActiveOnDate, signingScheduleReferenceDate, templateMatchesLesson, templatePeriodWhere, templatesOnDate } from "./template-period";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("schedule template validity windows", () => {
  const oldTemplate = { weekday: 3, startTime: "10:00", validFrom: null, validUntil: date("2026-11-01") };
  const nextTemplate = { weekday: 2, startTime: "10:00", validFrom: date("2026-11-01"), validUntil: null };

  it("closes the old schedule and opens the new one on the same date without overlap", () => {
    expect(templatesOnDate([oldTemplate, nextTemplate], date("2026-10-31"))).toEqual([oldTemplate]);
    expect(templatesOnDate([oldTemplate, nextTemplate], date("2026-11-01"))).toEqual([nextTemplate]);
    expect(templatesOnDate([oldTemplate, nextTemplate], date("2026-11-30"))).toEqual([nextTemplate]);
  });

  it("treats absent or null boundaries as unbounded for pre-migration templates", () => {
    expect(isTemplateActiveOnDate({}, date("2026-11-01"))).toBe(true);
    expect(isTemplateActiveOnDate({ validFrom: null, validUntil: null }, date("2026-11-01"))).toBe(true);
  });

  it("matches a bookable lesson only at the applicable date, weekday and time", () => {
    expect(templateMatchesLesson(oldTemplate, { lessonDate: date("2026-11-04"), startTime: "10:00" })).toBe(false);
    expect(templateMatchesLesson(nextTemplate, { lessonDate: date("2026-11-03"), startTime: "10:00" })).toBe(true);
    expect(templateMatchesLesson(nextTemplate, { lessonDate: date("2026-11-03"), startTime: "11:00" })).toBe(false);
    expect(templateMatchesLesson(nextTemplate, { lessonDate: date("2026-11-04"), startTime: "10:00" })).toBe(false);
    expect(templateMatchesLesson({ weekday: 2 }, { lessonDate: date("2026-11-03"), startTime: "10:00" })).toBe(true);
  });

  it("validates the child's selected plan at its effective date rather than today", () => {
    expect(isTemplateActiveOnDate(oldTemplate, date("2026-10-30"))).toBe(true);
    expect(isTemplateActiveOnDate(oldTemplate, date("2026-11-01"))).toBe(false);
    expect(templatePeriodWhere(new Date("2026-11-01T15:00:00Z"))).toEqual({ AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: date("2026-11-01") } }] },
      { OR: [{ validUntil: null }, { validUntil: { gt: date("2026-11-01") } }] }
    ] });
  });

  it("uses the paid anchor for contract weekdays across a schedule change", () => {
    const anchor = signingScheduleReferenceDate(null, new Date("2026-10-30T21:30:00Z"));
    expect(anchor).toEqual(date("2026-11-02"));
    expect(templatesOnDate([oldTemplate, nextTemplate], anchor)).toEqual([nextTemplate]);
    expect(signingScheduleReferenceDate({ paymentDueAt: new Date("2026-11-03T22:00:00Z") })).toEqual(date("2026-11-04"));
    expect(signingScheduleReferenceDate({ firstPaidLessonDate: date("2026-11-05"), paymentDueAt: date("2026-11-03") })).toEqual(date("2026-11-05"));
  });
});
