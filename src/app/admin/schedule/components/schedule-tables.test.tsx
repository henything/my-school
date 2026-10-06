// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleTables } from "./schedule-tables";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockReset(); });

const scheduleTemplates = [
  {
    id: "template-a", weekday: 2, startTime: "10:00", endTime: "11:00", status: "ACTIVE",
    group: { id: "group-a", name: "Группа Альфа" }, branch: { name: "Центр" }, coach: { displayName: "Тренер А" }
  },
  {
    id: "template-b", weekday: 4, startTime: "12:00", endTime: "13:00", status: "ACTIVE",
    group: { id: "group-b", name: "Группа Бета" }, branch: { name: "Север" }, coach: { displayName: "Тренер Б" }
  }
];

const lessons = [
  {
    id: "lesson-a", lessonDate: "2026-10-06", startTime: "10:00", endTime: "11:00", status: "SCHEDULED",
    changeReason: null, group: { id: "group-a", name: "Группа Альфа" }, branch: { name: "Центр" },
    coach: { displayName: "Тренер А" }, substituteCoach: null
  },
  {
    id: "lesson-b", lessonDate: "2026-11-05", startTime: "12:00", endTime: "13:00", status: "CANCELLED",
    changeReason: null, group: { id: "group-b", name: "Группа Бета" }, branch: { name: "Север" },
    coach: { displayName: "Тренер Б" }, substituteCoach: null
  }
];

function lessonsTable() {
  const panel = screen.getByRole("heading", { name: /^Занятия$/ }).closest<HTMLElement>(".panel");
  if (!panel) throw new Error("Таблица занятий не найдена");
  return within(panel);
}

describe("schedule filters", () => {
  it("applies the group and status to cards, counters and rows", () => {
    render(<ScheduleTables scheduleTemplates={scheduleTemplates} lessons={lessons} />);

    fireEvent.change(screen.getByLabelText("Группа"), { target: { value: "group-a" } });
    fireEvent.change(screen.getByLabelText("Статус"), { target: { value: "SCHEDULED" } });

    expect(screen.getByText("Занятия: 1")).toBeTruthy();
    expect(screen.getByText("В работе: 1")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Занятия по фильтру" })).toBeTruthy();
    expect(lessonsTable().getByRole("row", { name: /Группа Альфа/ })).toBeTruthy();
    expect(lessonsTable().queryByRole("row", { name: /Группа Бета/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    expect(screen.getByText("Занятия: 2")).toBeTruthy();
    expect(lessonsTable().getByRole("row", { name: /Группа Бета/ })).toBeTruthy();
  });

  it("filters lessons by month while keeping recurring templates visible", () => {
    render(<ScheduleTables scheduleTemplates={scheduleTemplates} lessons={lessons} />);

    const monthInput = screen.getByLabelText("Месяц занятий") as HTMLInputElement;
    expect(monthInput.type).toBe("month");
    fireEvent.change(monthInput, { target: { value: "2026-10" } });

    expect(screen.getByText("Занятия: 1")).toBeTruthy();
    expect(screen.getByText("Шаблоны: 2")).toBeTruthy();
    expect(lessonsTable().getByRole("row", { name: /06\/10\/2026/ })).toBeTruthy();
    expect(lessonsTable().queryByRole("row", { name: /05\/11\/2026/ })).toBeNull();
    expect(screen.getByText("1 из 2")).toBeTruthy();

    fireEvent.change(monthInput, { target: { value: "2027-04" } });
    expect(screen.getByText("Занятия: 0")).toBeTruthy();
    expect(screen.getByText("Шаблоны: 2")).toBeTruthy();
  });

  it("finds a lesson by the date format shown on screen", () => {
    render(<ScheduleTables scheduleTemplates={scheduleTemplates} lessons={lessons} />);

    fireEvent.change(screen.getByLabelText("Поиск"), { target: { value: "06.10.2026" } });

    expect(lessonsTable().getByRole("row", { name: /06\/10\/2026/ })).toBeTruthy();
    expect(lessonsTable().queryByRole("row", { name: /05\/11\/2026/ })).toBeNull();
    expect(screen.getByText("Занятия: 1")).toBeTruthy();
  });

  it("requires confirmation before deleting a specific group template", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ scheduleTemplate: { id: "template-a" } }) });
    vi.stubGlobal("fetch", request);
    render(<ScheduleTables scheduleTemplates={scheduleTemplates} lessons={lessons} />);

    fireEvent.click(screen.getByRole("button", { name: /Удалить шаблон: Группа Альфа/ }));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText("Удалить шаблон? Созданные занятия сохранятся.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/schedule-templates/template-a", { method: "DELETE" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });
});
