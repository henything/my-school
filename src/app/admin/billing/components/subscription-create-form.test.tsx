// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateSubscriptionForm } from "./subscription-create-form";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockReset(); });
const preview = { branchName: "Сад", pricingSource: "BRANCH_TARIFF", effectiveMonth: "2026-12", plannedLessonsCount: 3, baseLessonPriceKopeks: 37500, baseTotalAmountKopeks: 112500, appliedMakeupCount: 0, discountAmountKopeks: 11250, discountPercent: 10, creditAmountKopeks: 0, invoiceAmountKopeks: 101250, pricingToken: "a".repeat(64) };
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
function setup() {
  render(<CreateSubscriptionForm childOptions={[{ id: "child", fullName: "Ребёнок", currentGroup: { name: "Группа" } }]} />);
  fireEvent.focus(screen.getByRole("combobox", { name: "Найти ребёнка" }));
  fireEvent.click(screen.getByRole("option", { name: /Ребёнок/ }));
  fireEvent.change(screen.getByLabelText("Начало"), { target: { value: "2026-12-01" } });
  fireEvent.change(screen.getByLabelText("Конец"), { target: { value: "2026-12-31" } });
  return screen.getByRole("heading", { name: "Абонемент" }).closest("form")!;
}
describe("subscription price confirmation", () => {
  it("previews exact kopeks without saving, then submits the reviewed token", async () => {
    const request = vi.fn().mockResolvedValueOnce(reply({ preview })).mockResolvedValueOnce(reply({ subscription: {} }, 201));
    vi.stubGlobal("fetch", request);
    const form = setup();
    fireEvent.submit(form);
    await screen.findByLabelText("Предварительный расчёт");
    expect(screen.getByText(/Счёт к оплате/).textContent?.replace(/\s/g, "")).toContain("1012,50");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("/api/subscriptions/preview");
    fireEvent.submit(form);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({ pricingMode: "BRANCH_TARIFF", pricingToken: preview.pricingToken });
  });
  it("requires another confirmation after a 409 and submits the new price token", async () => {
    const updated = { ...preview, invoiceAmountKopeks: 121500, pricingToken: "b".repeat(64) };
    const request = vi.fn().mockResolvedValueOnce(reply({ preview })).mockResolvedValueOnce(reply({ error: "Цена изменилась" }, 409)).mockResolvedValueOnce(reply({ preview: updated })).mockResolvedValueOnce(reply({ subscription: {} }, 201));
    vi.stubGlobal("fetch", request);
    const form = setup(); fireEvent.submit(form);
    await screen.findByLabelText("Предварительный расчёт"); fireEvent.submit(form);
    await screen.findByText(/Расчёт изменился/);
    expect(refresh).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(3);
    fireEvent.submit(form);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(JSON.parse(request.mock.calls[3][1].body).pricingToken).toBe(updated.pricingToken);
  });
  it("invalidates a preview when dates change and keeps the manual exception explicit", async () => {
    const request = vi.fn().mockResolvedValue(reply({ preview })); vi.stubGlobal("fetch", request);
    const form = setup(); fireEvent.submit(form); await screen.findByLabelText("Предварительный расчёт");
    fireEvent.change(screen.getByLabelText("Конец"), { target: { value: "2026-12-28" } });
    expect(screen.queryByLabelText("Предварительный расчёт")).toBeNull();
    fireEvent.change(screen.getByLabelText("Расчёт"), { target: { value: "MANUAL" } });
    fireEvent.change(screen.getByLabelText("Базовая сумма до льгот и зачётов, ₽"), { target: { value: "1500.50" } });
    fireEvent.change(screen.getByLabelText("Причина ручного расчёта"), { target: { value: "Особый договор" } });
    fireEvent.submit(form);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({ pricingMode: "MANUAL", totalAmountRub: 1500.5, manualReason: "Особый договор", periodEnd: "2026-12-28" });
  });
});
