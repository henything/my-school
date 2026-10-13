import { describe, expect, it } from "vitest";
import { allocateByLessonGroup } from "./analytics-service";

describe("revenue attribution by historical lesson group", () => {
  it("splits money across groups after a mid-month transfer without losing kopeks", () => {
    const allocations = allocateByLessonGroup(10001, {
      groupId: "old",
      lessonSnapshots: [{ groupId: "old" }, { groupId: "new" }, { groupId: "new" }]
    });
    expect(allocations).toEqual([
      { groupId: "old", amountKopeks: 3334 },
      { groupId: "new", amountKopeks: 6667 }
    ]);
    expect(allocations.reduce((sum, row) => sum + row.amountKopeks, 0)).toBe(10001);
  });

  it("uses the stored subscription group when an old subscription has no lesson snapshots", () => {
    expect(allocateByLessonGroup(45000, { groupId: "former", lessonSnapshots: [] }))
      .toEqual([{ groupId: "former", amountKopeks: 45000 }]);
  });
});
