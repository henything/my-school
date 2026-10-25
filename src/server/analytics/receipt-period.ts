const MOSCOW_OFFSET = "+03:00";

export type ReceiptPeriod = { from: string; to: string; start: Date; endExclusive: Date };

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function resolveReceiptPeriod(input: { from?: string; to?: string }, now = new Date()): ReceiptPeriod {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const from = isDate(input.from) ? input.from : defaultFrom;
  const to = isDate(input.to) && input.to >= from ? input.to : (from > today ? from : today);
  const start = new Date(`${from}T00:00:00${MOSCOW_OFFSET}`);
  const endExclusive = new Date(new Date(`${to}T00:00:00${MOSCOW_OFFSET}`).getTime() + 86_400_000);
  return { from, to, start, endExclusive };
}

export function yookassaIncomeKopeks(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || !("object" in payload)) return null;
  const payment = payload.object;
  if (!payment || typeof payment !== "object" || !("income_amount" in payment)) return null;
  const income = payment.income_amount;
  if (!income || typeof income !== "object" || !("value" in income)) return null;
  const value = income.value;
  if (typeof value !== "string" || !/^\d+\.\d{2}$/.test(value)) return null;
  const kopeks = Number(value.replace(".", ""));
  return Number.isSafeInteger(kopeks) ? kopeks : null;
}

export function reconcileReceipts(
  payments: Array<{ amountKopeks: number; provider: string; providerPaymentId: string | null }>,
  incomeByPaymentId: Map<string, number>
) {
  let grossKopeks = 0;
  let feeKopeks = 0;
  let unknownFeeCount = 0;
  for (const payment of payments) {
    grossKopeks += payment.amountKopeks;
    if (payment.provider !== "YOOKASSA") continue;
    const income = payment.providerPaymentId ? incomeByPaymentId.get(payment.providerPaymentId) : undefined;
    if (income === undefined || income < 0 || income > payment.amountKopeks) {
      unknownFeeCount++;
      continue;
    }
    feeKopeks += payment.amountKopeks - income;
  }
  return {
    grossKopeks,
    feeKopeks: unknownFeeCount ? null : feeKopeks,
    netKopeks: unknownFeeCount ? null : grossKopeks - feeKopeks,
    unknownFeeCount
  };
}
