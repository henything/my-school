"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Period = {
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  presentDates: string[];
  unexcusedAbsenceDates: string[];
  sickAbsenceDates: string[];
  chargedCount: number;
  paidAmountKopeks: number;
  earnedAmountKopeks: number;
  currentInvoiceAmountKopeks: number;
  invoices: Array<{ number: string; status: string; amountKopeks: number; paidAmountKopeks: number }>;
};

type Settlement = {
  revision: string;
  childName: string;
  lastDate: string;
  status: string;
  currentGroup: { name: string } | null;
  trialDates: string[];
  periods: Period[];
  totalPaidKopeks: number;
  totalEarnedKopeks: number;
  potentialCreditKopeks: number;
  potentialDebtKopeks: number;
  attendanceWithoutSubscription: Array<{ date: string; status: string }>;
  missingAttendanceDates: string[];
  hasRefundedPayment: boolean;
  hasInvoiceAnomaly: boolean;
  hasOverlappingSubscriptions: boolean;
  hasExistingAdjustments: boolean;
  hasStandaloneInvoices: boolean;
  note: string;
};

const rub = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" });
const amount = (kopeks: number) => rub.format(kopeks / 100);

export function LeaveChildPanel({ childId, status }: { childId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [reason, setReason] = useState("");
  const [lastDate, setLastDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [error, setError] = useState("");

  async function show() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/children/${childId}/exit?lastDate=${encodeURIComponent(lastDate)}`);
      const payload = (await response.json()) as { settlement?: Settlement; error?: string };
      if (!response.ok || !payload.settlement) throw new Error(payload.error ?? "Не удалось получить расчёт.");
      setSettlement(payload.settlement);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось получить расчёт.");
    } finally {
      setLoading(false);
    }
  }

  async function leave() {
    if (!reason.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/children/${childId}/exit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), lastDate, expectedRevision: settlement?.revision })
      });
      const payload = (await response.json()) as { settlement?: Settlement; error?: string };
      if (!response.ok || !payload.settlement) throw new Error(payload.error ?? "Не удалось вывести ребёнка.");
      setSettlement(payload.settlement);
      setReason("");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось вывести ребёнка.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={show}>Расчёт ухода</Button>
      {open ? createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(22,34,30,0.4)] p-4">
          <div role="dialog" aria-modal="true" aria-label="Расчёт при уходе ребёнка" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold">Расчёт ухода: {settlement?.childName ?? "ребёнок"}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{settlement?.currentGroup?.name ?? "Без текущей группы"}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Закрыть</Button>
            </div>
            {loading ? <p className="mt-4">Загрузка…</p> : null}
            {error ? <p role="alert" className="mt-4 text-sm font-semibold text-[var(--danger-strong)]">{error}</p> : null}
            {settlement ? (
              <div className="mt-4 grid gap-4 text-sm">
                <label className="label">Последний день посещения<input className="field" type="date" max={new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" })} value={lastDate} onChange={(event) => setLastDate(event.target.value)} /></label>
                <Button type="button" variant="secondary" onClick={show}>Обновить расчёт</Button>
                {settlement.lastDate !== lastDate ? <p className="font-semibold text-[var(--warning-strong)]">Дата изменена. Обновите расчёт перед подтверждением.</p> : null}
                <div className="grid gap-1 rounded-lg bg-[var(--panel-soft)] p-4">
                  <div>Оплачено: <strong>{amount(settlement.totalPaidKopeks)}</strong></div>
                  <div>Стоимость учтённых занятий: <strong>{amount(settlement.totalEarnedKopeks)}</strong></div>
                  <div>Возможный зачёт / возврат: <strong>{amount(settlement.potentialCreditKopeks)}</strong></div>
                  <div>Возможный долг: <strong>{amount(settlement.potentialDebtKopeks)}</strong></div>
                </div>
                {settlement.trialDates.length ? <p>Бесплатные пробные: {settlement.trialDates.join(", ")}</p> : null}
                {settlement.periods.map((period) => (
                  <div key={period.subscriptionId} className="rounded-lg border border-[var(--line)] p-3">
                    <div className="font-bold">{period.periodStart}–{period.periodEnd}</div>
                    <div>Был: {period.presentDates.join(", ") || "нет отметок"}</div>
                    <div>Пропуск без причины: {period.unexcusedAbsenceDates.join(", ") || "нет"}</div>
                    <div>Болезнь: {period.sickAbsenceDates.join(", ") || "нет"}</div>
                    <div>К оплате по отметкам: {period.chargedCount} занятий · {amount(period.earnedAmountKopeks)}</div>
                    <div>Оплачено: {amount(period.paidAmountKopeks)} · текущие счета: {amount(period.currentInvoiceAmountKopeks)}</div>
                    {period.invoices.map((invoice) => (
                      <div key={invoice.number} className="text-[var(--muted)]">Счёт {invoice.number}: {invoice.status}, {amount(invoice.amountKopeks)}, оплачено {amount(invoice.paidAmountKopeks)}</div>
                    ))}
                  </div>
                ))}
                {settlement.missingAttendanceDates.length ? <p className="font-semibold text-[var(--warning-strong)]">Не заполнены табели: {settlement.missingAttendanceDates.join(", ")}</p> : null}
                {settlement.attendanceWithoutSubscription.length ? <p className="font-semibold text-[var(--warning-strong)]">Есть занятия без абонемента: {settlement.attendanceWithoutSubscription.map((record) => record.date).join(", ")}</p> : null}
                {settlement.hasRefundedPayment || settlement.hasExistingAdjustments || settlement.hasStandaloneInvoices || settlement.hasInvoiceAnomaly || settlement.hasOverlappingSubscriptions
                  ? <p className="font-semibold text-[var(--warning-strong)]">Есть возврат, отдельный или нестандартный счёт либо пересекающиеся абонементы — проверьте расчёт вручную.</p>
                  : null}
                <p className="text-[var(--muted)]">{settlement.note}</p>
                {["ACTIVE", "PAUSED"].includes(status) && ["ACTIVE", "PAUSED"].includes(settlement.status) ? (
                  <div className="grid gap-2 border-t border-[var(--line)] pt-4">
                    <label className="label">Причина ухода<input className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Например, больше не ходит" /></label>
                    <p>Действие изменит статус на «Ушёл», завершит участие после выбранной даты, пересчитает неоплаченные счета и зафиксирует сумму к возврату по оплаченным. Перевод денег выполняется отдельно.</p>
                    <Button type="button" disabled={loading || !reason.trim() || settlement.lastDate !== lastDate || settlement.missingAttendanceDates.length > 0} onClick={leave}>Подтвердить уход</Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
