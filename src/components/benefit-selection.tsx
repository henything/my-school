"use client";
import { BENEFIT_CATEGORIES, benefitLabels, type BenefitCategory } from "@/lib/benefits";

export function BenefitSelection({ value, onChange, disabled = false }: { value: BenefitCategory | null; onChange: (category: BenefitCategory | null) => void; disabled?: boolean }) {
  return <fieldset className="grid gap-3 rounded-xl border border-[var(--line)] p-4" disabled={disabled}>
    <legend className="px-1 font-bold">Скидка 10% на абонемент</legend>
    <p className="text-sm text-[var(--muted)]">Относитесь ли вы к одной из категорий? Скидка действует после подтверждения администратором, без срока окончания. Скидки не суммируются.</p>
    <label className="flex items-start gap-2 text-sm"><input type="radio" name="benefitCategory" checked={!value} onChange={() => onChange(null)} className="mt-1" />Не отношусь к этим категориям</label>
    {BENEFIT_CATEGORIES.map(category => <label key={category} className="flex items-start gap-2 text-sm"><input type="radio" name="benefitCategory" checked={value === category} onChange={() => onChange(category)} className="mt-1" />{benefitLabels[category]}</label>)}
    <p className="text-xs text-[var(--muted)]">Для семьи с двумя детьми скидка предоставляется обоим. Уже выставленные счета не меняются.</p>
  </fieldset>;
}
