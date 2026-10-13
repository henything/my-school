import { describe, expect, it } from "vitest";
import { childrenScheduledForLesson } from "./group-membership";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const child = (id: string, fullName: string) => ({ id, fullName, attendancePlans: [] });

describe("historical group roster", () => {
  it("shows the former group before a transfer and the new group from the transfer date", () => {
    const transferred = child("child-1", "Иван Иванов");
    const oldGroup = [{ startDate: date("2026-09-01"), endDate: date("2026-10-05"), child: transferred }];
    const newGroup = [{ startDate: date("2026-10-05"), endDate: null, child: transferred }];

    expect(childrenScheduledForLesson(oldGroup, [], date("2026-10-04")).map((item) => item.id)).toEqual(["child-1"]);
    expect(childrenScheduledForLesson(oldGroup, [], date("2026-10-05"))).toEqual([]);
    expect(childrenScheduledForLesson(newGroup, [], date("2026-10-05")).map((item) => item.id)).toEqual(["child-1"]);
  });

  it("keeps a marked lesson editable after the child leaves", () => {
    const departed = child("child-2", "Михаил Петров");
    expect(childrenScheduledForLesson([], [{ childId: departed.id, child: departed }], date("2026-10-06")))
      .toEqual([departed]);
  });

  it("uses the attendance plan that applied on the lesson date", () => {
    const weekly = {
      ...child("child-3", "Анна Соколова"),
      attendancePlans: [{ effectiveFrom: date("2026-10-01"), weekday: 3 }]
    };
    const membership = [{ startDate: date("2026-09-01"), endDate: null, child: weekly }];

    expect(childrenScheduledForLesson(membership, [], date("2026-10-07"))).toHaveLength(1);
    expect(childrenScheduledForLesson(membership, [], date("2026-10-08"))).toHaveLength(0);
  });
});
