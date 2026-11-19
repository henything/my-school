// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PayButton } from "./pay-button";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("labels SBP, prevents double clicks and allows retry after a provider error", async () => {
  let finish!: (value: unknown) => void;
  const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue({ ok: false, json: async () => ({ error: "СБП недоступна" }) });
  vi.stubGlobal("fetch", request);
  render(<PayButton invoiceId="invoice-1" />);
  const button = screen.getByRole("button", { name: "Оплатить через СБП" }) as HTMLButtonElement;
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button.disabled).toBe(true);
  expect(request).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith("/api/parent/invoices/invoice-1/pay", { method: "POST", headers: { "Content-Type": "application/json" } });
  finish({ ok: false, json: async () => ({ error: "СБП недоступна" }) });
  await waitFor(() => expect(screen.getByText("СБП недоступна")).toBeTruthy());
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
});
