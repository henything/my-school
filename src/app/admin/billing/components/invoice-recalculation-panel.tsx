"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type SubscriptionOption = { id: string; child: { fullName: string }; periodStart: string; periodEnd: string };
type Preview = {
  subscriptionId: string;
  subscriptionUpdatedAt: string;
  invoiceUpdatedAt: string | null;
  invoiceNumber: string | null;
  childName: string;
  previousLessonsCount: number;
  nextLessonsCount: number;
  previousInvoiceAmountKopeks: number | null;
  nextInvoiceAmountKopeks: number;
  paidAmountKopeks: number;
  appliedMakeupCount: number;
  currentBalance: number;
  nextBalance: number;
  canApply: boolean;
  blockReason: string | null;
  historyWarning: string | null;
};

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" });

export function InvoiceRecalculationPanel({ subscriptions }: { subscriptions: SubscriptionOption[] }) {
  const router = useRouter();
  const [subscriptionId, setSubscriptionId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestPreview() {
    if (!subscriptionId) return;
    setLoading(true);
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch(`/api/admin/subscriptions/${subscriptionId}/recalculate`);
      const payload = (await response.json()) as { preview?: Preview; error?: string };
      if (!response.ok || !payload.preview) throw new Error(payload.error ?? "Не удалось рассчитать счёт.");
      setPreview(payload.preview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось рассчитать счёт.");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!preview?.canApply || !preview.invoiceUpdatedAt || !reason.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/subscriptions/${preview.subscriptionId}/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          expectedSubscriptionUpdatedAt: preview.subscriptionUpdatedAt,
          expectedInvoiceUpdatedAt: preview.invoiceUpdatedAt
        })
      });
      const payload = (await response.json()) as { preview?: Preview; error?: string };
      if (!response.ok || !payload.preview) throw new Error(payload.error ?? "Не удалось пересчитать счёт.");
      setPreview(payload.preview);
      setReason("");
      setMessage("Абонемент, баланс и неоплаченный счёт пересчитаны.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось пересчитать счёт.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel grid gap-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Пересчёт после исправления посещаемости</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Проверьте табели и даты участия в группе перед изменением счёта.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="label min-w-[280px] flex-1">
          Абонемент
          <select className="field" value={subscriptionId} onChange={(event) => { setSubscriptionId(event.target.value); setPreview(null); setMessage(""); }}>
            <option value="">Выберите ребёнка и период</option>
            {subscriptions.map((subscription) => (
              <option key={subscription.id} value={subscription.id}>{subscription.child.fullName} · {subscription.periodStart}–{subscription.periodEnd}</option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" disabled={!subscriptionId || loading} onClick={requestPreview}>
          {loading ? "Загрузка…" : "Показать расчёт"}
        </Button>
      </div>
      {preview ? (
        <div className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">
          <div className="font-bold">{preview.childName} · счёт {preview.invoiceNumber ?? "не выставлен"}</div>
          <div>Занятия: {preview.previousLessonsCount} → {preview.nextLessonsCount}</div>
          <div>Сумма: {money.format((preview.previousInvoiceAmountKopeks ?? 0) / 100)} → {money.format(preview.nextInvoiceAmountKopeks / 100)}</div>
          <div>Оплачено: {money.format(preview.paidAmountKopeks / 100)} · зачтено переносов: {preview.appliedMakeupCount}</div>
          <div>Баланс занятий: {preview.currentBalance} → {preview.nextBalance}</div>
          {preview.historyWarning ? <p className="font-semibold text-[var(--warning-strong)]">{preview.historyWarning}</p> : null}
          {preview.blockReason ? <p className="font-semibold text-[var(--danger-strong)]">{preview.blockReason}</p> : null}
          {preview.canApply ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="label min-w-[280px] flex-1">
                Причина пересчёта
                <input className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Исправлен табель за 8 октября" required />
              </label>
              <Button type="button" disabled={loading || !reason.trim()} onClick={apply}>Применить пересчёт</Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="text-sm font-semibold text-[var(--muted)]">{message}</p> : null}
    </section>
  );
}
