"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MAX_MANUAL_LESSONS } from "@/server/billing/manual-correction-rules";
import type { CorrectionPreview } from "@/server/billing/manual-correction-service";

type Child = { id: string; fullName: string; status: string; cachedLessonBalance: number; currentGroup: { name: string } | null };
type Invoice = { id: string; child: { id: string; fullName: string }; number: string; amountKopeks: number; status: string };
type History = { id: string; transactionId: string | null; kind: string; delta: number; previousValue: number | null; nextValue: number | null; reason: string; date: string; actor: string; invoice: string | null; reversed: boolean; canReverse: boolean };
const money = (n: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(n / 100);
const valueLabel = (kind: string, n: number) => kind === "INVOICE_AMOUNT" ? money(n) : `${n} занятий`;
async function api(body: unknown) {
  const response = await fetch("/api/admin/billing-corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить корректировку.");
  return result.preview as CorrectionPreview;
}
export function ManualCorrectionPanel({ childOptions, invoices }: { childOptions: Child[]; invoices: Invoice[] }) {
  const router = useRouter();
  const historyRequest = useRef(0);
  const [childId, setChildId] = useState("");
  const [mode, setMode] = useState("LESSON_BALANCE");
  const [direction, setDirection] = useState("ADD");
  const [quantity, setQuantity] = useState("1");
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<History[]>([]);
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [pending, setPending] = useState<{ input: unknown; operationId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const child = childOptions.find(x => x.id === childId);
  const reset = () => { setPreview(null); setPending(null); setMessage(""); setError(""); };
  async function loadHistory(id: string) {
    const request = ++historyRequest.current;
    const response = await fetch(`/api/admin/billing-corrections?childId=${encodeURIComponent(id)}`);
    const payload = await response.json();
    if (request !== historyRequest.current) return;
    if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить историю.");
    setHistory(payload.history);
  }
  async function calculate(input: unknown) {
    setBusy(true); setError(""); setMessage(""); setPreview(null); setPending(null);
    try { const next = await api({ action: "preview", input }); setPreview(next); setPending({ input, operationId: crypto.randomUUID() }); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось рассчитать."); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview || !pending) return;
    setBusy(true); setError("");
    try {
      const result = await api({ action: "apply", ...pending, expectedVersion: preview.version });
      setMessage(`${result.kind === "INVOICE_AMOUNT" ? "Сумма счёта" : "Остаток занятий"}: ${valueLabel(result.kind, result.previousValue)} → ${valueLabel(result.kind, result.nextValue)}. Изменение сохранено.`);
      setPreview(null); setPending(null); setReason(""); router.refresh();
      await loadHistory(result.childId).catch(() => setError("Изменение сохранено, но история не загрузилась. Обновите страницу."));
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить. Повторите отправку для проверки результата."); }
    finally { setBusy(false); }
  }
  return <section className="panel grid gap-4 p-5">
    <h2 className="text-lg font-bold">Ручные изменения занятий и счёта</h2>
    <label className="label">Ребёнок<select className="field" value={childId} disabled={busy} onChange={e => { const id = e.target.value; historyRequest.current++; setChildId(id); setInvoiceId(""); reset(); setHistory([]); if (id) loadHistory(id).catch(err => setError(err.message)); }}>
      <option value="">Выберите ребёнка</option>{childOptions.filter(x => !["ARCHIVED", "LEFT"].includes(x.status)).map(x => <option key={x.id} value={x.id}>{x.fullName} · {x.currentGroup?.name ?? "Без группы"}</option>)}
    </select></label>
    {child ? <>
      <p className="text-sm">Текущий остаток: <strong>{child.cachedLessonBalance} занятий</strong></p>
      <label className="label">Что изменить<select className="field" value={mode} disabled={busy} onChange={e => { setMode(e.target.value); reset(); }}><option value="LESSON_BALANCE">Остаток занятий</option><option value="INVOICE_AMOUNT">Сумму конкретного счёта</option></select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "LESSON_BALANCE" ? <>
          <label className="label">Действие<select className="field" value={direction} disabled={busy} onChange={e => { setDirection(e.target.value); reset(); }}><option value="ADD">Добавить занятия</option><option value="SUBTRACT">Списать занятия</option></select></label>
          <label className="label">Количество занятий, шт.<input className="field" type="number" min={1} max={MAX_MANUAL_LESSONS} step={1} value={quantity} disabled={busy} onChange={e => { setQuantity(e.target.value); reset(); }} /></label>
        </> : <>
          <label className="label">Счёт<select className="field" value={invoiceId} disabled={busy} onChange={e => { setInvoiceId(e.target.value); setAmount(""); reset(); }}><option value="">Выберите счёт</option>{invoices.filter(x => x.child.id === childId).map(x => <option key={x.id} value={x.id}>{x.number} · {money(x.amountKopeks)} · {({ PAID: "Оплачен", CANCELLED: "Отменён", ISSUED: "Выставлен", OVERDUE: "Просрочен", PAYMENT_PENDING: "Оплата начата", PARTIALLY_PAID: "Частично оплачен", DRAFT: "Черновик" } as Record<string,string>)[x.status] ?? "Проверка"}</option>)}</select></label>
          <label className="label">Новая итоговая сумма счёта, ₽<input className="field" inputMode="decimal" placeholder="2250,00" value={amount} disabled={busy} onChange={e => { setAmount(e.target.value); reset(); }} /></label>
        </>}
      </div>
      <p className="text-sm text-[var(--muted)]">{mode === "LESSON_BALANCE" ? "Меняется только количество занятий. Сумма счёта сохраняется. Для отработок создайте перенос в разделе переносов." : "Меняется итог выбранного счёта. Количество занятий сохраняется. Поправка действует только на этот счёт и учитывается при его последующем пересчёте."}</p>
      <label className="label">Причина изменения<textarea className="field" maxLength={1000} value={reason} disabled={busy} onChange={e => { setReason(e.target.value); reset(); }} /></label>
      <Button type="button" variant="secondary" disabled={busy || !reason.trim() || (mode === "INVOICE_AMOUNT" && !invoiceId)} onClick={() => calculate(mode === "LESSON_BALANCE" ? { kind: mode, childId, direction, quantity, reason } : { kind: mode, invoiceId, targetAmountRub: amount, reason })}>Показать результат</Button>
      {preview ? <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-4" role="status">
        <strong>{preview.childName}{preview.invoiceNumber ? ` · ${preview.invoiceNumber}` : ""}</strong>
        {preview.invoicePeriod ? <p>Период: {preview.invoicePeriod}</p> : null}
        <p>{valueLabel(preview.kind, preview.previousValue)} → {valueLabel(preview.kind, preview.nextValue)}</p>
        <p>Изменение: {preview.delta > 0 ? "+" : ""}{valueLabel(preview.kind, preview.delta)}</p>
        <p>{preview.kind === "INVOICE_AMOUNT" ? `Остаток занятий: ${preview.currentLessonBalance} → ${preview.nextLessonBalance}. Оплата по счёту отсутствует.` : "Сумма счёта сохраняется."}</p>
        {preview.kind === "INVOICE_AMOUNT" ? <p>Начисление до ручных поправок: {money(preview.ordinaryKopeks!)}. Поправки: {money(preview.manualTotalKopeks!)}. Денежные зачёты: {money(preview.creditKopeks)}.</p> : null}
        {preview.unchanged ? <p>Значение уже установлено. Новое движение не требуется.</p> : <Button type="button" disabled={busy} onClick={apply}>{preview.kind === "INVOICE_AMOUNT" ? `Изменить счёт на ${money(preview.nextValue)}` : `Изменить остаток до ${preview.nextValue} занятий`}</Button>}
      </div> : null}
      <h3 className="font-bold">История ручных изменений</h3>
      {!history.length ? <p className="text-sm">Ручных корректировок нет.</p> : history.map(x => <div className="grid gap-2 rounded-lg border border-[var(--line)] p-3 text-sm" key={x.id}>
        <strong>{new Date(x.date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК · {x.actor}</strong>
        <p>{x.invoice ? `Счёт ${x.invoice}: ` : "Занятия: "}{x.previousValue !== null ? `${valueLabel(x.kind,x.previousValue)} → ${valueLabel(x.kind,x.nextValue!)}; ` : ""}изменение {x.delta > 0 ? "+" : ""}{valueLabel(x.kind,x.delta)}</p>
        <p>{x.reason}{x.reversed ? " · Отменено встречной записью" : ""}</p>
        {x.canReverse ? <Button type="button" variant="secondary" disabled={busy || !reason.trim()} onClick={() => calculate({ kind: "REVERSE", ...(x.transactionId ? { transactionId: x.transactionId } : { operationId: x.id }), reason })}>Показать отмену корректировки</Button> : null}
      </div>)}
      <p className="text-xs text-[var(--muted)]">Чтобы отменить ошибочную операцию, укажите причину в поле выше. История сохраняется.</p>
    </> : null}
    {error ? <p role="alert" className="text-sm font-semibold text-[var(--danger-strong)]">{error}</p> : null}
    {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
  </section>;
}
