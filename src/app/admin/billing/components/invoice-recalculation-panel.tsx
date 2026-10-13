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
  nextLessons: Array<{ id: string; date: string }>;
  previousLessonDates: string[] | null;
  addedLessonDates: string[] | null;
  removedLessonDates: string[] | null;
  previousInvoiceAmountKopeks: number | null;
  nextInvoiceAmountKopeks: number;
  paidAmountKopeks: number;
  appliedMakeupCount: number;
  currentBalance: number;
  nextBalance: number;
  canApply: boolean;
  canApplyPaid: boolean;
  paidDifferenceKopeks: number;
  blockReason: string | null;
  historyWarning: string | null;
};

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" });

export function InvoiceRecalculationPanel({ subscriptions }: { subscriptions: SubscriptionOption[] }) {
  const router = useRouter();
  const [subscriptionId, setSubscriptionId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [paidDifferenceAction, setPaidDifferenceAction] = useState<"CREDIT" | "REFUND_DUE">("CREDIT");
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
    if ((!preview?.canApply && !preview?.canApplyPaid) || !preview.invoiceUpdatedAt || !reason.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/subscriptions/${preview.subscriptionId}/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          paidDifferenceAction: preview.canApplyPaid ? paidDifferenceAction : undefined,
          expectedSubscriptionUpdatedAt: preview.subscriptionUpdatedAt,
          expectedInvoiceUpdatedAt: preview.invoiceUpdatedAt,
          expectedLessonIds: preview.nextLessons.map((lesson) => lesson.id)
        })
      });
      const payload = (await response.json()) as { preview?: Preview; error?: string };
      if (!response.ok || !payload.preview) throw new Error(payload.error ?? "Не удалось пересчитать счёт.");
      setPreview(payload.preview);
      setReason("");
      setMessage(preview.canApplyPaid ? "Абонемент пересчитан. Оплаченный счёт сохранён, разница зафиксирована отдельно." : "Абонемент, баланс и неоплаченный счёт пересчитаны.");
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
          <div>Новые платные даты: {preview.nextLessons.map((lesson) => lesson.date).join(", ") || "нет"}</div>
          {preview.previousLessonDates ? <div>Ранее учтённые даты: {preview.previousLessonDates.join(", ") || "нет"}</div> : <div className="text-[var(--warning-strong)]">Для старого абонемента даты исходного расчёта не сохранены; сравните число занятий с табелем.</div>}
          {preview.addedLessonDates?.length ? <div>Добавятся: {preview.addedLessonDates.join(", ")}</div> : null}
          {preview.removedLessonDates?.length ? <div>Исключатся: {preview.removedLessonDates.join(", ")}</div> : null}
          {preview.canApplyPaid ? <div className="font-bold">Разница по оплаченному счёту: {money.format(preview.paidDifferenceKopeks / 100)}. Сам счёт останется без изменений.</div> : null}
          {preview.historyWarning ? <p className="font-semibold text-[var(--warning-strong)]">{preview.historyWarning}</p> : null}
          {preview.blockReason ? <p className="font-semibold text-[var(--danger-strong)]">{preview.blockReason}</p> : null}
          {preview.canApply || preview.canApplyPaid ? (
            <div className="flex flex-wrap items-end gap-3">
              {preview.canApplyPaid ? <label className="label min-w-[280px]">Как учесть разницу<select className="field" value={paidDifferenceAction} onChange={(event) => setPaidDifferenceAction(event.target.value as "CREDIT" | "REFUND_DUE")}><option value="CREDIT">Зачесть в следующем месяце</option><option value="REFUND_DUE">Сумма к возврату (без перевода денег)</option></select></label> : null}
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
