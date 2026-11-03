"use client";
import { BENEFIT_CATEGORIES, benefitLabels, type BenefitCategory } from "@/lib/benefits";

export function BenefitSelection({ value, onChange, disabled = false, onFileChange, hasEvidence = false, selectedFileName }: { value: BenefitCategory | null; onChange: (category: BenefitCategory | null) => void; disabled?: boolean; onFileChange?: (file: File | null) => void; hasEvidence?: boolean; selectedFileName?: string }) {
  return <fieldset className="grid gap-3 rounded-xl border border-[var(--line)] p-4" disabled={disabled}>
    <legend className="px-1 font-bold">Скидка 10% на абонемент</legend>
    <p className="text-sm text-[var(--muted)]">Относитесь ли вы к одной из категорий? Прикрепите подтверждение — скидка 10% за первый расчётный месяц будет предоставлена сразу. Для следующих месяцев основание проверит администратор. Скидки не суммируются.</p>
    <label className="flex items-start gap-2 text-sm"><input type="radio" name="benefitCategory" checked={!value} onChange={() => onChange(null)} className="mt-1" />Не отношусь к этим категориям</label>
    {BENEFIT_CATEGORIES.map(category => <label key={category} className="flex items-start gap-2 text-sm"><input type="radio" name="benefitCategory" checked={value === category} onChange={() => onChange(category)} className="mt-1" />{benefitLabels[category]}</label>)}
    {value && onFileChange ? <label className="label">Документ, подтверждающий льготу
      <input key={value} className="field" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required={!hasEvidence && !selectedFileName} onChange={event => onFileChange(event.target.files?.[0] ?? null)} />
      {selectedFileName ? <span className="text-xs font-normal">Выбран файл: {selectedFileName}</span> : null}
      <span className="text-xs font-normal text-[var(--muted)]">PDF или фото JPEG, PNG, WebP до 5 МБ. {hasEvidence ? "Ранее прикреплённый документ сохранён; при необходимости загрузите новый." : "Например, удостоверение или справка, подтверждающие выбранную категорию."}</span>
    </label> : null}
    <p className="text-xs text-[var(--muted)]">Для семьи с двумя детьми скидка предоставляется обоим. После подтверждения скидка бессрочная. При отказе или до завершения проверки со следующего месяца скидки нет. Уже выставленные счета не меняются.</p>
  </fieldset>;
}
