import { expect, it } from "vitest";
import { describeWeeklySchedule } from "./weekly-schedule";

it("describes the chosen single day and the full group schedule for a contract", () => {
  expect(describeWeeklySchedule([4, 2], 4)).toBe("1 занятие в неделю, по четвергам");
  expect(describeWeeklySchedule([4, 2], null)).toBe("2 занятия в неделю, по вторникам и четвергам");
  expect(() => describeWeeklySchedule([1, 3, 5], null)).toThrow("одно или два занятия");
});

it("rejects a schedule without active lessons or a removed selected day", () => {
  expect(() => describeWeeklySchedule([], null)).toThrow("не найдено действующее расписание");
  expect(() => describeWeeklySchedule([2, 4], 3)).toThrow("больше нет в расписании");
  expect(() => describeWeeklySchedule([2, 2], null)).toThrow("несколько занятий");
  expect(() => describeWeeklySchedule([2, 2, 4], 2)).toThrow("несколько занятий");
  expect(describeWeeklySchedule([2, 2, 4], 4)).toBe("1 занятие в неделю, по четвергам");
});
