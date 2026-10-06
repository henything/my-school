import { describe, expect, it } from "vitest";
import { isLessonInChildPlan, weekdayForLesson } from "./attendance-plan";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("individual weekly attendance", () => {
  it("keeps the full group schedule until a fixed weekday takes effect", () => {
    const plans = [{ effectiveFrom: date("2026-11-01"), weekday: 1 }];
    expect(isLessonInChildPlan(plans, date("2026-10-28"))).toBe(true);
    expect(isLessonInChildPlan(plans, date("2026-11-02"))).toBe(true);
    expect(isLessonInChildPlan(plans, date("2026-11-04"))).toBe(false);
  });

  it("uses the most recent plan and permits returning to every group lesson", () => {
    const plans = [
      { effectiveFrom: date("2026-11-01"), weekday: 1 },
      { effectiveFrom: date("2026-12-01"), weekday: null },
    ];
    expect(weekdayForLesson(plans, date("2026-11-30"))).toBe(1);
    expect(isLessonInChildPlan(plans, date("2026-12-02"))).toBe(true);
    expect(isLessonInChildPlan([], date("2026-11-04"))).toBe(true);
  });
});
