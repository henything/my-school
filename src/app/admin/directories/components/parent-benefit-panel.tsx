"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { BENEFIT_CATEGORIES, benefitLabels, benefitLabel, benefitStatusLabels, type BenefitCategory } from "@/lib/benefits";

type Parent = { id: string; fullName: string | null; phone: string | null; benefitCategory: string | null; benefitStatus: string; benefitReviewComment: string | null; updatedAt: string };
export function ParentBenefitPanel({ parents }: { parents: Parent[] }) {
  const router = useRouter(); const [id, setId] = useState(""); const [category, setCategory] = useState<BenefitCategory>("LARGE_FAMILY");
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [action, setAction] = useState<"APPROVED" | "REJECTED" | "NONE">("APPROVED");
  const dialog = useRef<HTMLDialogElement>(null); const parent = parents.find(item => item.id === id); const pending = parents.filter(item => item.benefitStatus === "PENDING");
  function selectParent(next: string) { setId(next); const item = parents.find(p => p.id === next); setCategory((item?.benefitCategory as BenefitCategory) || "LARGE_FAMILY"); setReason(""); setMessage(""); }
  async function save() {
    if (!parent || !reason.trim()) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/parents/${parent.id}/benefit`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: action === "NONE" ? null : category, status: action, reason, expectedUpdatedAt: parent.updatedAt }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Не удалось сохранить льготу.");
      dialog.current?.close(); setMessage("Решение сохранено. Оно применяется только к новым счетам."); setReason(""); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка соединения."); }
    finally { setBusy(false); }
  }
  return <section className="panel grid gap-4 p-5" aria-label="Льготы родителей">
    <div><h2 className="text-lg font-bold">Льготы родителей · 10%</h2><p className="mt-1 text-sm text-[var(--muted)]">Ожидают подтверждения: {pending.length}. Скидка бессрочная, без суммирования; старые счета не изменяются.</p></div>
    {pending.length ? <div className="flex flex-wrap gap-2">{pending.map(item => <Button key={item.id} size="sm" variant="secondary" onClick={() => selectParent(item.id)}>{item.fullName || "Родитель"} {item.phone} · {benefitLabel(item.benefitCategory)}</Button>)}</div> : null}
    <SearchableCombobox key={id || "none"} name="benefitParentId" ariaLabel="Родитель для льготы" defaultValue={id} onValueChange={selectParent} options={parents.map(p => ({ value: p.id, label: p.fullName || p.phone || "Родитель", description: `${p.phone || ""} · ${benefitStatusLabels[p.benefitStatus]}` }))} placeholder="Выберите родителя" />
    {parent ? <>
      <p className="text-sm">{benefitStatusLabels[parent.benefitStatus]}{parent.benefitCategory ? ` · ${benefitLabel(parent.benefitCategory)}` : ""}</p>
      {parent.benefitReviewComment ? <p className="text-sm text-[var(--muted)]">Последнее решение: {parent.benefitReviewComment}</p> : null}
      <label className="label">Категория<select className="field" value={category} onChange={event => setCategory(event.target.value as BenefitCategory)}>{BENEFIT_CATEGORIES.map(key => <option key={key} value={key}>{benefitLabels[key]}</option>)}</select></label>
      <label className="label">Основание решения<textarea className="field" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} placeholder="Почему назначаем, отклоняем или снимаем льготу" /></label>
      <div className="flex flex-wrap gap-2">{([['APPROVED', 'Подтвердить скидку 10%'], ['REJECTED', 'Отклонить заявку'], ['NONE', 'Снять льготу']] as const).map(([status, label]) => <Button key={status} type="button" variant={status === "APPROVED" ? "primary" : "secondary"} disabled={busy || !reason.trim()} onClick={() => { setAction(status); setMessage(""); dialog.current?.showModal(); }}>{label}</Button>)}</div>
    </> : null}
    <dialog ref={dialog} aria-label="Решение по льготе" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white p-5 backdrop:bg-black/30" onCancel={event => { if (busy) event.preventDefault(); }}>
      <h3 className="text-lg font-bold">{action === "APPROVED" ? "Подтвердить скидку 10%?" : action === "REJECTED" ? "Отклонить заявку?" : "Снять льготу?"}</h3>
      <p className="my-4 text-sm">{parent?.fullName || parent?.phone}. {benefitLabel(category)}. Решение действует для новых счетов. Выставленные и оплаченные счета останутся прежними.</p>
      {message ? <p role="alert" className="mb-3 text-sm text-red-700">{message}</p> : null}
      <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Отмена</Button><Button disabled={busy} onClick={save}>{busy ? "Сохраняем…" : "Сохранить решение"}</Button></div>
    </dialog>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </section>;
}
