// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BranchTariffPanel } from "./branch-tariff-panel";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const data = { month: "2026-12", currentMonth: "2026-11", lessonPriceKopeks: 45000, branch: { status: "ACTIVE" }, tariffs: [], changes: [] };
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
it("shows a comparison before saving and refreshes a conflicting edit", async () => {
  const request = vi.fn().mockResolvedValueOnce(reply(data)).mockResolvedValueOnce(reply(data)).mockResolvedValueOnce(reply({ error: "Тариф уже изменён. Обновите данные и проверьте цену." }, 409)).mockResolvedValueOnce(reply({ ...data, lessonPriceKopeks: 37500 }));
  vi.stubGlobal("fetch", request); render(<BranchTariffPanel branchId="branch" />);
  fireEvent.click(screen.getByRole("button", { name: "Тарифы" }));
  await screen.findByText("Периоды действия (0)");
  fireEvent.change(screen.getByLabelText("Месяц действия"), { target: { value: "2026-12" } });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await screen.findByLabelText("Тариф");
  fireEvent.change(screen.getByLabelText("Тариф"), { target: { value: "37500" } });
  expect(screen.queryByRole("button", { name: "Сохранить тариф" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Показать изменение" }));
  fireEvent.click(screen.getByRole("button", { name: "Сохранить тариф" }));
  await screen.findByText(/Тариф уже изменён/);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
  expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({ effectiveMonth: "2026-12", lessonPriceKopeks: 37500, expectedVersion: 0 });
  expect(screen.queryByRole("button", { name: "Сохранить тариф" })).toBeNull();
});
it("allows viewing a past tariff without offering changes", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...data, month: "2026-10", currentMonth: "9999-01" })));
  render(<BranchTariffPanel branchId="branch" />); fireEvent.click(screen.getByRole("button", { name: "Тарифы" }));
  await screen.findByText(/Завершённые месяцы/);
  expect(screen.queryByLabelText("Тариф")).toBeNull();
});
