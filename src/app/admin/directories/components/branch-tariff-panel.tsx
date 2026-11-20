"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type TariffData = {
  effectiveMonth: string; currentLessonPriceKopeks: number; lessonPriceKopeks: number; expectedVersion: number;
  branch: { status: string };
  changes: { id: string; oldValue: { lessonPriceKopeks?: number } | null; newValue: { lessonPriceKopeks?: number; effectiveMonth?: string }; author: string; createdAt: string }[];
};
const money = (n: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(n / 100);
export function BranchTariffPanel({ branchId, branchName }: { branchId: string; branchName?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TariffData | null>(null);
  const [price, setPrice] = useState(45000);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);
  async function load() {
    const requestId = ++sequence.current;
    setBusy(true); setConfirm(false);
    try {
      const response = await fetch(`/api/branches/${branchId}/tariffs`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить тарифы.");
      if (requestId === sequence.current) { setData(payload); setPrice(payload.lessonPriceKopeks); }
    } catch (error) { if (requestId === sequence.current) { setData(null); setMessage(error instanceof Error ? error.message : "Не удалось загрузить тарифы."); } }
    finally { if (requestId === sequence.current) setBusy(false); }
  }
  async function save() {
    if (!data || !confirm) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/branches/${branchId}/tariffs`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedEffectiveMonth: data.effectiveMonth, lessonPriceKopeks: price, expectedVersion: data.expectedVersion }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить тариф.");
      setMessage("Тариф сохранён. Созданные ранее абонементы и счета сохраняют свои суммы.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить тариф."); }
    finally { await load(); }
  }
  const editable = data && data.branch.status === "ACTIVE";
  return <div className="mt-3 border-t border-[var(--line)] pt-3">
    <Button type="button" variant="secondary" size="sm" aria-haspopup="dialog" onClick={() => { dialog.current?.showModal(); setOpen(true); setData(null); setMessage(""); void load(); }}>Тарифы</Button>
    <dialog ref={dialog} aria-labelledby={titleId} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-5 text-[var(--foreground)] shadow-xl backdrop:bg-black/40"
      onClose={() => setOpen(false)}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
      }}>
    {open ? <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id={titleId} className="text-xl font-bold">Тарифы сада</h2>{branchName ? <p className="mt-1 text-sm text-[var(--muted)]">{branchName}</p> : null}</div>
        <Button type="button" variant="secondary" size="sm" onClick={() => dialog.current?.close()}>Закрыть</Button>
      </div>

      {busy ? <p role="status" className="text-sm">Загружаем тариф…</p> : null}
      {data ? <>
        <p className="text-sm">Сейчас: <strong>{money(data.currentLessonPriceKopeks)} за занятие</strong> · {money(data.currentLessonPriceKopeks * 8)} за 8 занятий.</p>
        <p className="text-sm">Изменение применяется со следующего месяца: <strong>{new Date(`${data.effectiveMonth}-01T12:00:00Z`).toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" })}</strong>. Текущие счета сохраняют свои суммы.</p>
        {editable ? <>
          <label className="label">Цена со следующего месяца<select className="field" value={price} disabled={busy} onChange={e => { setPrice(Number(e.target.value)); setConfirm(false); }}>
            <option value={45000}>450 ₽/занятие — 3 600 ₽ за 8</option><option value={37500}>375 ₽/занятие — 3 000 ₽ за 8</option>
          </select></label>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirm(true)}>Показать изменение</Button>
          {confirm ? <div className="rounded-lg border border-[var(--line)] p-3 text-sm">
            <p className="font-bold">С {data.effectiveMonth}: {money(data.lessonPriceKopeks)} → {money(price)} за занятие</p>
            <p className="my-2">Для новых абонементов всех групп этого филиала. Созданные ранее абонементы и счета сохраняют свои суммы.</p>
            <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>Сохранить тариф</Button>
          </div> : null}
        </> : <p className="text-sm text-[var(--muted)]">Неактивный филиал доступен только для просмотра.</p>}
        <details className="text-sm"><summary className="cursor-pointer font-bold">История изменений ({data.changes.length})</summary><ul className="mt-2 grid gap-2">{data.changes.map(c => <li key={c.id}>{new Date(c.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} · {c.author} · с {c.newValue.effectiveMonth}: {c.oldValue?.lessonPriceKopeks ? money(c.oldValue.lessonPriceKopeks) : "Новая запись"} → {money(c.newValue.lessonPriceKopeks ?? 45000)}</li>)}</ul></details>
      </> : null}
      {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
    </div> : null}
    </dialog>
  </div>;
}
