// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InvoiceRefresh, PayButton } from "./pay-button";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("labels SBP, prevents double clicks and allows retry after a provider error", async () => {
  let finish!: (value: unknown) => void;
  const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue({ ok: false, json: async () => ({ error: "СБП недоступна" }) });
  vi.stubGlobal("fetch", request);
  render(<PayButton invoiceId="invoice-1" expectedAmountKopeks={135000} />);
  const button = screen.getByRole("button", { name: "Оплатить через СБП" }) as HTMLButtonElement;
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button.disabled).toBe(true);
  expect(request).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith("/api/parent/invoices/invoice-1/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedAmountKopeks: 135000 }) });
  finish({ ok: false, json: async () => ({ error: "СБП недоступна" }) });
  await waitFor(() => expect(screen.getByText("СБП недоступна")).toBeTruthy());
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
});

it("refreshes visible invoices on return and periodically, then removes listeners and timers", () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<InvoiceRefresh />);
  fireEvent(window, new Event("focus"));
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(30_000));
  expect(refresh).toHaveBeenCalledTimes(2);
  visibility.mockReturnValue("hidden");
  act(() => vi.advanceTimersByTime(30_000));
  expect(refresh).toHaveBeenCalledTimes(2);
  visibility.mockReturnValue("visible");
  fireEvent(document, new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(3);
  view.unmount();
  fireEvent(window, new Event("focus"));
  act(() => vi.advanceTimersByTime(30_000));
  expect(refresh).toHaveBeenCalledTimes(3);
});

it("refreshes a changed invoice and requires another click after the new amount is displayed", async () => {
  const request = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Сумма счёта изменилась. Проверьте обновлённый счёт." }) });
  vi.stubGlobal("fetch", request);
  const view = render(<PayButton invoiceId="invoice-1" expectedAmountKopeks={135000} />);
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<PayButton invoiceId="invoice-1" expectedAmountKopeks={150000} />);
  await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
  expect(request).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ expectedAmountKopeks: 150000 });
});
