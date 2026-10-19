// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BillingTables } from "./billing-tables";

afterEach(cleanup);

it("shows the invoice after credits as the amount due beside the full subscription price", () => {
  render(<BillingTables
    childRows={[]}
    subscriptions={[{
      id: "subscription-1",
      childId: "child-1",
      child: { fullName: "Тестовый ребёнок" },
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      plannedLessonsCount: 8,
      totalAmountKopeks: 360000,
      appliedMakeupCount: 5,
      paymentStatus: "INVOICED",
      paymentStatusChangedAt: null,
      paymentStatusComment: "Зачтено переносов: 5"
    }]}
    invoices={[{
      id: "invoice-1",
      subscriptionId: "subscription-1",
      issuedAt: "2026-10-14T10:25:00.000Z",
      number: "Счёт 1",
      child: { fullName: "Тестовый ребёнок" },
      parent: { fullName: "Тестовый родитель", phone: null },
      amountKopeks: 135000,
      paidAmountKopeks: 0,
      dueDate: "2026-10-21",
      status: "ISSUED"
    }]}
    payments={[]}
    transactions={[]}
  />);

  const subscriptions = screen.getByRole("heading", { name: "Абонементы" }).closest(".panel");
  if (!subscriptions) throw new Error("Таблица абонементов не найдена");
  const row = within(subscriptions as HTMLElement).getByRole("row", { name: /Тестовый ребёнок/ });

  expect(row.textContent).toContain("Полная стоимость: 3 600 ₽");
  expect(row.textContent).toContain("Зачтено переносов: 5");
  expect(row.textContent).toContain("Учтено в счёте: −2 250 ₽");
  expect(row.textContent).toContain("Счёт: 1 350 ₽");
  expect(row.textContent).toContain("Осталось оплатить: 1 350 ₽");
});
