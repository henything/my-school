// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingForms } from "./billing-forms";
import { InvoiceForms } from "./invoice-forms";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockReset(); });

const children = ["Оплачен", "Не оплачен", "Без абонемента"].map((name, i) => ({
  id: `child-${i}`, fullName: `Ребёнок ${name}`, status: "ACTIVE", currentGroup: { name: "Группа" },
  cachedLessonBalance: 2, admissionStatus: "ADMITTED"
}));
const subscriptions = [
  { id: "sub-paid", childId: "child-0", periodEnd: "2026-11-30", createdAt: "2026-11-01T00:00:00.000Z", paymentStatus: "PAID", manualPaymentStatusLocked: true },
  { id: "sub-unpaid", childId: "child-1", periodEnd: "2026-11-30", createdAt: "2026-11-01T00:00:00.000Z", paymentStatus: "NOT_PAID", manualPaymentStatusLocked: false }
];

function statusForm() {
  const form = screen.getByRole("heading", { name: "Оплата" }).closest("form")!;
  return { form, ui: within(form) };
}

function selectChild(name: string) {
  const { ui } = statusForm();
  fireEvent.change(ui.getByRole("combobox", { name: "Найти ребёнка" }), { target: { value: name } });
  fireEvent.click(ui.getByRole("option", { name: new RegExp(name) }));
}

describe("manual payment status form", () => {
  it("offers only unpaid statuses and blocks settled subscriptions without sending a request", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    render(<BillingForms childOptions={children} subscriptions={subscriptions} />);
    selectChild("Ребёнок Оплачен");
    const { form, ui } = statusForm();
    expect(ui.queryByRole("combobox", { name: "Статус" })).toBeNull();
    expect((ui.getByLabelText("Статус") as HTMLInputElement).value).toBe("Оплачен");
    expect((ui.getByLabelText("Статус") as HTMLInputElement).disabled).toBe(true);
    expect((ui.getByRole("button", { name: "Обновить" }) as HTMLButtonElement).disabled).toBe(true);
    expect(ui.getByText("Статус рассчитан по оплатам или зачётам")).toBeTruthy();
    fireEvent.submit(form);
    expect(request).not.toHaveBeenCalled();
  });

  it("submits an unpaid status and clears the selected child after success", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ subscription: {} }) });
    vi.stubGlobal("fetch", request);
    render(<BillingForms childOptions={children} subscriptions={subscriptions} />);
    selectChild("Ребёнок Не оплачен");
    const { form, ui } = statusForm();
    expect(ui.getAllByRole("option").map(o => (o as HTMLOptionElement).value)).toEqual(["NOT_INVOICED", "INVOICED", "NOT_PAID", "OVERDUE"]);
    fireEvent.change(ui.getByLabelText("Статус"), { target: { value: "NOT_PAID" } });
    fireEvent.change(ui.getByLabelText("Комментарий"), { target: { value: "Ожидаем перевод" } });
    fireEvent.submit(form);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith("/api/children/child-1/payment-status", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ status: "NOT_PAID", comment: "Ожидаем перевод" })
    }));
    expect((ui.getByRole("button", { name: "Обновить" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("chooses the latest period end, then creation date, instead of trusting array order", () => {
    render(<BillingForms childOptions={children} subscriptions={[
      { ...subscriptions[1], id: "old", periodEnd: "2026-10-31", createdAt: "2026-12-01T00:00:00.000Z" },
      { ...subscriptions[1], id: "new-older", createdAt: "2026-10-01T00:00:00.000Z" },
      { ...subscriptions[1], id: "new", manualPaymentStatusLocked: true }
    ]} />);
    selectChild("Ребёнок Не оплачен");
    expect(statusForm().ui.getByText("Статус рассчитан по оплатам или зачётам")).toBeTruthy();
  });

  it("allows changing the child after selecting a locked or missing subscription", () => {
    render(<BillingForms childOptions={children} subscriptions={subscriptions} />);
    selectChild("Ребёнок Оплачен");
    selectChild("Ребёнок Без абонемента");
    expect(statusForm().ui.getByText("Сначала создайте абонемент ребёнку.")).toBeTruthy();
    selectChild("Ребёнок Не оплачен");
    expect((statusForm().ui.getByRole("button", { name: "Обновить" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

it("keeps manual payment as an exception with a reason and the existing endpoint", async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invoice: {} }) });
  vi.stubGlobal("fetch", request);
  render(<InvoiceForms subscriptions={[]} invoices={[{
    id: "invoice-1", number: "Счёт 1", status: "ISSUED", remainingAmountKopeks: 90000, child: { fullName: "Ребёнок" }
  }]} />);
  const form = screen.getByRole("heading", { name: "Ручная оплата — исключение" }).closest("form")!;
  const ui = within(form);
  fireEvent.focus(ui.getByRole("combobox", { name: "Найти счёт" }));
  fireEvent.click(ui.getByRole("option", { name: /Счёт 1/ }));
  fireEvent.change(ui.getByLabelText("Сумма, руб."), { target: { value: "200" } });
  fireEvent.change(ui.getByLabelText("Причина ручной оплаты"), { target: { value: "Исключение: перевод" } });
  fireEvent.submit(form);
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(request).toHaveBeenCalledWith("/api/admin/invoices/invoice-1/mark-paid", expect.objectContaining({
    method: "POST", body: JSON.stringify({ amountKopeks: 20000, comment: "Исключение: перевод" })
  }));
});
