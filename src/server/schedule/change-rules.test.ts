import { describe, expect, it } from "vitest";
import { incompatiblePlans, scheduleHorizon } from "./change-rules";
import { buildLessonCandidates, type TemplateForGeneration } from "./generation";
import { scheduleChangeSchema } from "./change-schema";
const date = (key: string) => new Date(`${key}T00:00:00Z`);
const slots = [{ weekday: 2, startTime: "10:00", endTime: "11:00" }, { weekday: 4, startTime: "10:00", endTime: "11:00" }];

describe("schedule replacement rules", () => {
  it("keeps October Mon/Wed and only creates eight Tue/Thu November lessons", () => {
    const base = { groupId: "g", branchId: "b", coachId: "c", startTime: "10:00", endTime: "11:00" };
    const templates: TemplateForGeneration[] = [
      ...[1, 3].map(day => ({ ...base, id: `old-${day}`, weekday: day, validUntil: date("2026-11-01") })),
      ...[2, 4].map(day => ({ ...base, id: `new-${day}`, weekday: day, validFrom: date("2026-11-01") }))
    ];
    expect(buildLessonCandidates(templates, "2026-11").map(l => l.lessonDate.getUTCDate()).sort((a,b)=>a-b)).toEqual([3,5,10,12,17,19,24,26]);
    expect(buildLessonCandidates(templates, "2026-10")).toHaveLength(8);
    expect(buildLessonCandidates(templates, "2026-11")).toHaveLength(8);
  });

  it("finds both current and future invalid individual plans without changing all-days", () => {
    expect(incompatiblePlans([{ id: "child", fullName: "Ребёнок", attendancePlans: [
      { effectiveFrom: date("2026-10-01"), weekday: 3 }, { effectiveFrom: date("2026-12-01"), weekday: null },
      { effectiveFrom: date("2027-01-01"), weekday: 1 }
    ] }], date("2026-11-01"), slots)).toEqual([
      { childId: "child", childName: "Ребёнок", effectiveFrom: "2026-11-01", previousWeekday: 3 },
      { childId: "child", childName: "Ребёнок", effectiveFrom: "2027-01-01", previousWeekday: 1 }
    ]);
  });

  it("covers existing generated dates beyond the normal academic year", () => {
    expect(scheduleHorizon(date("2026-11-01"), [date("2027-06-30")])).toEqual(date("2027-06-30"));
  });

  it("rejects impossible dates and overlapping weekly slots", () => {
    const base = { groupId: "00000000-0000-4000-8000-000000000001", reason: "Изменение", slots, effectiveFrom: "2026-11-01" };
    expect(scheduleChangeSchema.safeParse({ ...base, effectiveFrom: "2026-02-30" }).success).toBe(false);
    expect(scheduleChangeSchema.safeParse({ ...base, slots: [...slots, { weekday: 2, startTime: "10:30", endTime: "11:30" }] }).success).toBe(false);
    expect(scheduleChangeSchema.safeParse(base).success).toBe(true);
  });
});
