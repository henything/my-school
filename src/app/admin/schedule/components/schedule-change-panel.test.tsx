// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleChangePanel } from "./schedule-change-panel";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockReset(); });
const groupId = "7a82b2b7-f9a6-4b47-828e-0c77e1bc541d";
const groups = [{ id: groupId, name: "Группа А", status: "ACTIVE", branch: { name: "Сад 81" } }];
const result = { fingerprint: "a".repeat(64), groupName: "Группа А", effectiveFrom: "2026-11-01", through: "2027-05-31", cancelled: [{ date: "2026-11-02", time: "10:00" }], created: [], preserved: [], planChoices: [], blockers: [], bills: [], manualTaskCount: 0, manualTasks: [], applied: false };
function fill() {
  fireEvent.change(screen.getByLabelText("Группа для изменения расписания"), { target: { value: groupId } });
  fireEvent.change(screen.getByLabelText("Новое расписание действует с"), { target: { value: "2026-11-01" } });
  fireEvent.change(screen.getByLabelText("Причина изменения"), { target: { value: "Новый график группы" } });
}
const applyButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Подтвердить и применить изменения" });
describe("schedule change confirmation", () => {
  it("invalidates the fingerprint when input changes and sends the reviewed payload once", async () => {
    const request = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ result }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ result }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ result: { ...result, applied: true } }) });
    vi.stubGlobal("fetch", request);
    render(<ScheduleChangePanel groups={groups} />); fill();
    fireEvent.click(screen.getByRole("button", { name: "Предварительный расчёт" }));
    await waitFor(() => expect(applyButton().disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Начало 1"), { target: { value: "10:30" } });
    expect(screen.queryByRole("button", { name: "Подтвердить и применить изменения" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Предварительный расчёт" }));
    await waitFor(() => expect(applyButton().disabled).toBe(false));
    fireEvent.click(applyButton());
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    const body = JSON.parse(request.mock.calls[2][1].body);
    expect(body.fingerprint).toBe(result.fingerprint);
    expect(body.slots[0].startTime).toBe("10:30");
    expect(body.action).toBe("apply");
    expect(screen.queryByRole("button", { name: "Подтвердить и применить изменения" })).toBeNull();
  });
  it("requires a new preview after choosing a child plan and an explicit manual task acknowledgment", async () => {
    const choice = { childId: "child-a", childName: "Роман", effectiveFrom: "2026-11-01", previousWeekday: 3 };
    const request = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ result: { ...result, planChoices: [choice], blockers: ["Роман: выберите новый график"] } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ result: { ...result, planChoices: [choice], manualTaskCount: 1, manualTasks: ["Роман: сумма оплаченного счёта увеличилась, нужна проверка."] } }) });
    vi.stubGlobal("fetch", request);
    render(<ScheduleChangePanel groups={groups} />); fill();
    fireEvent.click(screen.getByRole("button", { name: "Предварительный расчёт" }));
    await waitFor(() => expect(screen.getByText("Сначала устраните препятствия")).toBeTruthy());
    expect(applyButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Новый график Роман с 01.11.2026"), { target: { value: "all" } });
    expect(screen.queryByRole("button", { name: "Подтвердить и применить изменения" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Предварительный расчёт" }));
    const checkbox = await screen.findByRole("checkbox");
    expect(applyButton().disabled).toBe(true);
    expect(screen.getByText("Роман: сумма оплаченного счёта увеличилась, нужна проверка.")).toBeTruthy();
    expect(JSON.parse(request.mock.calls[1][1].body).plans).toEqual([{ childId: "child-a", effectiveFrom: "2026-11-01", weekday: null }]);
    fireEvent.click(checkbox);
    expect(applyButton().disabled).toBe(false);
  });
});
