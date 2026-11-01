import { benefitLabel } from "@/lib/benefits";
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" });
export function BenefitBreakdown({ invoice }: { invoice: { discountPercent?: number; discountCategory?: string | null; discountAmountKopeks?: number; amountBeforeDiscountKopeks?: number | null; amountKopeks: number } }) {
  if (!invoice.discountPercent) return null;
  const afterBenefit = (invoice.amountBeforeDiscountKopeks ?? invoice.amountKopeks) - (invoice.discountAmountKopeks ?? 0);
  const credit = Math.max(0, afterBenefit - invoice.amountKopeks);
  return <div className="mt-1 grid gap-1 text-xs font-normal text-[var(--muted)]">
    {invoice.amountBeforeDiscountKopeks != null ? <span>До скидки: {money.format(invoice.amountBeforeDiscountKopeks / 100)}</span> : null}
    <span>Скидка {invoice.discountPercent}%: −{money.format((invoice.discountAmountKopeks ?? 0) / 100)}</span>
    <span>{benefitLabel(invoice.discountCategory)}</span>
    {credit > 0 ? <span>Зачёт переплаты: −{money.format(credit / 100)}</span> : null}
  </div>;
}
