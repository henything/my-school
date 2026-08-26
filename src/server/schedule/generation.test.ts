import { describe, expect, it } from "vitest";
import {
  buildAcademicYearLessonCandidates,
  buildAcademicYearMonthKeys,
  buildLessonCandidates,
  dateToWeekday,
  datesForWeekdayInMonth,
  parseMonthKey
} from "./generation";

describe("schedule generation", () => {
  it("parses a YYYY-MM month key", () => {
    expect(parseMonthKey("2026-06")).toEqual({ year: 2026, monthIndex: 5 });
  });

  it("rejects invalid month keys", () => {
    expect(() => parseMonthKey("2026-13")).toThrow();
    expect(() => parseMonthKey("06-2026")).toThrow();
  });

  it("uses Monday as weekday 1 and Sunday as weekday 7", () => {
    expect(dateToWeekday(new Date("2026-06-08T00:00:00.000Z"))).toBe(1);
    expect(dateToWeekday(new Date("2026-06-14T00:00:00.000Z"))).toBe(7);
  });

  it("finds every matching weekday in a month", () => {
    expect(datesForWeekdayInMonth("2026-06", 1).map((date) => date.toISOString().slice(0, 10))).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29"
    ]);
  });

  it("builds lesson candidates from active templates", () => {
    const candidates = buildLessonCandidates(
      [
        {
          id: "template-1",
          groupId: "group-1",
          branchId: "branch-1",
          coachId: "coach-1",
          weekday: 3,
          startTime: "10:00",
          endTime: "11:00"
        }
      ],
      "2026-06"
    );

    expect(candidates).toHaveLength(4);
    expect(candidates[0]).toMatchObject({
      scheduleTemplateId: "template-1",
      groupId: "group-1",
      startTime: "10:00",
      endTime: "11:00"
    });
  });

  it("builds academic year month keys from September through May", () => {
    expect(buildAcademicYearMonthKeys(2026)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05"
    ]);
  });

  it("builds academic year candidates without summer months", () => {
    const candidates = buildAcademicYearLessonCandidates(
      [
        {
          id: "template-1",
          groupId: "group-1",
          branchId: "branch-1",
          coachId: "coach-1",
          weekday: 1,
          startTime: "10:00",
          endTime: "11:00"
        }
      ],
      2026
    );
    const dateKeys = candidates.map((candidate) => candidate.lessonDate.toISOString().slice(0, 10));

    expect(dateKeys).toContain("2026-09-07");
    expect(dateKeys).toContain("2027-05-31");
    expect(dateKeys.some((dateKey) => ["06", "07", "08"].includes(dateKey.slice(5, 7)))).toBe(false);
  });
});
