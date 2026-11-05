import { todayInMoscow } from "@/server/children/attendance-plan";

type DebtInvoice = {
  parentId: string;
  amountKopeks: number;
  paidAmountKopeks: number;
  dueDate: Date;
};

// Invoice dates are calendar dates. A bill becomes overdue on the next day in Moscow.
// A parent with both overdue and upcoming bills appears in both corresponding groups.
export function summarizeDebt(invoices: DebtInvoice[], today = todayInMoscow()) {
  const waiting = new Set<string>();
  const overdue = new Set<string>();
  let waitingAmountKopeks = 0;
  let overdueAmountKopeks = 0;
  for (const invoice of invoices) {
    const balance = Math.max(0, invoice.amountKopeks - invoice.paidAmountKopeks);
    if (!balance) continue;
    if (invoice.dueDate < today) {
      overdue.add(invoice.parentId);
      overdueAmountKopeks += balance;
    } else {
      waiting.add(invoice.parentId);
      waitingAmountKopeks += balance;
    }
  }
  return { waitingCount: waiting.size, overdueCount: overdue.size, waitingAmountKopeks, overdueAmountKopeks };
}
