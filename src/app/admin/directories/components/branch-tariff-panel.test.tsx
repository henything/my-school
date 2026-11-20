// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BranchTariffPanel } from "./branch-tariff-panel";
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const data = { effectiveMonth: "2026-12", currentLessonPriceKopeks: 45000, lessonPriceKopeks: 45000, expectedVersion: 0, branch: { status: "ACTIVE" }, tariffs: [], changes: [] };
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
it("shows a comparison before saving and refreshes a conflicting edit", async () => {
  const request = vi.fn().mockResolvedValueOnce(reply(data)).mockResolvedValueOnce(reply({ error: "Тариф уже изменён. Обновите данные и проверьте цену." }, 409)).mockResolvedValueOnce(reply({ ...data, lessonPriceKopeks: 37500 }));
  vi.stubGlobal("fetch", request); render(<BranchTariffPanel branchId="branch" />);
  fireEvent.click(screen.getByRole("button", { name: "Тарифы" }));
  await screen.findByLabelText("Цена со следующего месяца");
  expect(screen.queryByLabelText("Месяц действия")).toBeNull();
  await screen.findByLabelText("Цена со следующего месяца");
  fireEvent.change(screen.getByLabelText("Цена со следующего месяца"), { target: { value: "37500" } });
  expect(screen.queryByRole("button", { name: "Сохранить тариф" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Показать изменение" }));
  fireEvent.click(screen.getByRole("button", { name: "Сохранить тариф" }));
  await screen.findByText(/Тариф уже изменён/);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ expectedEffectiveMonth: "2026-12", lessonPriceKopeks: 37500, expectedVersion: 0 });
  expect(screen.queryByRole("button", { name: "Сохранить тариф" })).toBeNull();
});
it("allows viewing an inactive branch without offering changes", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...data, branch: { status: "ARCHIVED" } })));
  render(<BranchTariffPanel branchId="branch" />); fireEvent.click(screen.getByRole("button", { name: "Тарифы" }));
  await screen.findByText(/Неактивный филиал/);
  expect(screen.queryByLabelText("Цена со следующего месяца")).toBeNull();
});
