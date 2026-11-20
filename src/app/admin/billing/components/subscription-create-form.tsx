"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";

type ChildOption = { id: string; fullName: string; currentGroup: { name: string } | null };
type Preview = { branchName: string; pricingSource: string; effectiveMonth: string; plannedLessonsCount: number; baseLessonPriceKopeks: number; baseTotalAmountKopeks: number; appliedMakeupCount: number; discountAmountKopeks: number; discountPercent: number; creditAmountKopeks: number; invoiceAmountKopeks: number; pricingToken: string };
const money = (n: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(n / 100);
export function CreateSubscriptionForm({ childOptions }: { childOptions: ChildOption[] }) {
  const router = useRouter();
  const [mode, setMode] = useState("BRANCH_TARIFF");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const disabled = busy || !childOptions.length;
  async function requestPreview(body: unknown) {
    const response = await fetch("/api/subscriptions/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Не удалось получить расчёт.");
    return payload.preview as Preview;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = { childId: data.get("childId"), periodStart: data.get("periodStart"), periodEnd: data.get("periodEnd"), pricingMode: mode,
      ...(mode === "MANUAL" ? { totalAmountRub: Number(data.get("totalAmountRub")), manualReason: data.get("manualReason"), ...(String(data.get("plannedLessonsCount") ?? "").trim() ? { plannedLessonsCount: Number(data.get("plannedLessonsCount")) } : {}) } : {}) };
    try {
      if (!preview) { setPreview(await requestPreview(body)); return; }
      const response = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, pricingToken: preview.pricingToken }) });
      const payload = await response.json();
      if (response.status === 409) {
        setPreview(null);
        const updated = await requestPreview(body);
        setPreview(updated); setMessage("Расчёт изменился. Проверьте новую сумму и подтвердите создание ещё раз.");
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Не удалось создать абонемент.");
      setPreview(null); form.reset(); setMode("BRANCH_TARIFF");
      setMessage("Абонемент и счёт созданы."); router.refresh();
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "Не удалось сохранить."); }
    finally { setBusy(false); }
  }
  return <form className="panel grid content-start gap-4 p-5" onSubmit={submit} onChange={() => setPreview(null)}>
    <h2 className="flex items-center gap-2 text-lg font-bold"><WalletCards aria-hidden="true" size={18} />Абонемент</h2>
    <label className="label">Ребёнок<SearchableCombobox name="childId" placeholder="Выберите ребёнка" ariaLabel="Найти ребёнка" required disabled={disabled} onValueChange={() => setPreview(null)} options={childOptions.map(c => ({ value: c.id, label: c.fullName, description: c.currentGroup?.name ?? "Без группы" }))} /></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">Начало<input className="field" name="periodStart" type="date" required disabled={disabled} /></label>
      <label className="label">Конец<input className="field" name="periodEnd" type="date" required disabled={disabled} /></label>
    </div>
    <label className="label">Расчёт<select className="field" value={mode} disabled={disabled} onChange={e => { setMode(e.target.value); setPreview(null); }}><option value="BRANCH_TARIFF">По тарифу сада и расписанию</option><option value="MANUAL">Ручная сумма — исключение</option></select></label>
    {mode === "MANUAL" ? <>
      <label className="label">Занятий<input className="field" type="number" min={1} step={1} name="plannedLessonsCount" placeholder="По расписанию" disabled={disabled} /></label>
      <label className="label">Базовая сумма до льгот и зачётов, ₽<input className="field" type="number" name="totalAmountRub" required min={0.01} step={0.01} disabled={disabled} /></label>
      <label className="label">Причина ручного расчёта<input className="field" name="manualReason" required minLength={3} disabled={disabled} /></label>
    </> : <p className="text-sm text-[var(--muted)]">Цена сада действует на выбранный месяц. Количество занятий определяется по расписанию и графику ребёнка.</p>}
    {preview ? <div className="grid gap-2 rounded-lg border border-[var(--line)] p-4 text-sm" aria-label="Предварительный расчёт">
      <p className="font-bold">{preview.branchName} · {preview.effectiveMonth}</p>
      <p>{preview.plannedLessonsCount} занятий × {money(preview.baseLessonPriceKopeks)} · база {money(preview.baseTotalAmountKopeks)}</p>
      <p>{preview.pricingSource === "MANUAL" ? "Ручная сумма" : preview.pricingSource === "DEFAULT" ? "Стандартный тариф сада" : "Тариф сада"}</p>
      <p>Переносов зачтено: {preview.appliedMakeupCount}</p>
      <p>Льгота {preview.discountPercent}%: −{money(preview.discountAmountKopeks)}</p>
      <p>Денежный зачёт: −{money(preview.creditAmountKopeks)}</p>
      <p className="text-lg font-bold">Счёт к оплате: {money(preview.invoiceAmountKopeks)}</p>
      <p className="text-[var(--muted)]">Пока ничего не сохранено. Проверьте расчёт и подтвердите создание.</p>
    </div> : null}
    <div><Button type="submit" disabled={disabled}>{busy ? "Проверяем…" : preview ? "Создать абонемент и счёт" : "Показать расчёт"}</Button></div>
    {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
  </form>;
}
