// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ManualCorrectionPanel } from "./manual-correction-panel";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("requires a fresh preview after editing the invoice target and sends rubles separately from lessons", async () => {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ({ ok: true, json: async () => options ? { preview: { childId:"child", childName:"Ребёнок", invoiceNumber:"Ноябрь", kind:"INVOICE_AMOUNT", previousValue:405000, nextValue:225000, delta:-180000, version:"a".repeat(64), currentLessonBalance:9, nextLessonBalance:9, ordinaryKopeks:405000, manualTotalKopeks:-180000, creditKopeks:0 } } : { history:[] } }));
  vi.stubGlobal("fetch", fetcher);
  render(<ManualCorrectionPanel childOptions={[{id:"child", fullName:"Ребёнок",status:"ACTIVE",cachedLessonBalance:9,currentGroup:null}]} invoices={[{id:"invoice",child:{id:"child",fullName:"Ребёнок"},number:"Ноябрь",amountKopeks:405000,status:"ISSUED"}]} />);
  fireEvent.change(screen.getByLabelText("Ребёнок"), {target:{value:"child"}});
  fireEvent.change(screen.getByLabelText("Что изменить"), {target:{value:"INVOICE_AMOUNT"}});
  fireEvent.change(screen.getByLabelText("Счёт"), {target:{value:"invoice"}});
  fireEvent.change(screen.getByLabelText("Новая итоговая сумма счёта, ₽"), {target:{value:"2250,00"}});
  fireEvent.change(screen.getByLabelText("Причина изменения"), {target:{value:"Исправление начисления"}});
  fireEvent.click(screen.getByRole("button",{name:"Показать результат"}));
  await screen.findByRole("button",{name:/Изменить счёт на/});
  const sent = JSON.parse(fetcher.mock.calls.find(([,options]) => options)?.[1]?.body as string);
  expect(sent.input).toEqual({kind:"INVOICE_AMOUNT",invoiceId:"invoice",targetAmountRub:"2250,00",reason:"Исправление начисления"});
  expect(screen.getByText(/Остаток занятий: 9 → 9/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Новая итоговая сумма счёта, ₽"), {target:{value:"3000"}});
  await waitFor(() => expect(screen.queryByRole("button",{name:/Изменить счёт на/})).toBeNull());
  expect(fetcher.mock.calls.filter(([,options]) => options)).toHaveLength(1);
});
