"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, ShieldAlert, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { labelForEnum } from "@/lib/labels";

type Child = {
  id: string;
  fullName: string;
  status: string;
  currentGroup: { name: string } | null;
  cachedLessonBalance: number;
  admissionStatus: string;
};

type BillingFormsProps = {
  childOptions: Child[];
  subscriptions: PaymentStatusSubscription[];
};

type PaymentStatusSubscription = {
  id: string;
  childId: string;
  periodEnd: string;
  createdAt: string;
  paymentStatus: string;
  manualPaymentStatusLocked: boolean;
};

const paymentStatuses = [
  ["NOT_INVOICED", "Не выставлен"],
  ["INVOICED", "Выставлен"],
  ["NOT_PAID", "Не оплачен"],
  ["OVERDUE", "Просрочен"]
] as const;

function optionalNumber(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? Number(text) : undefined;
}

async function submitJson<T = unknown>(path: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "Не удалось сохранить.");
  }

  return payload;
}

export function BillingForms({ childOptions, subscriptions }: BillingFormsProps) {
  const activeChildren = childOptions.filter((child) => child.status !== "ARCHIVED");

  return (
    <section className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <CreateSubscriptionForm childOptions={activeChildren} />
        <PaymentStatusForm childOptions={activeChildren} subscriptions={subscriptions} />
      </div>
      <AdmissionCheckForm />
    </section>
  );
}

function CreateSubscriptionForm({ childOptions }: { childOptions: Child[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = childOptions.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const plannedLessonsCount = optionalNumber(formData.get("plannedLessonsCount"));
    const totalAmountRub = optionalNumber(formData.get("totalAmountRub"));

    try {
      await submitJson("/api/subscriptions", "POST", {
        childId: formData.get("childId"),
        periodStart: formData.get("periodStart"),
        periodEnd: formData.get("periodEnd"),
        ...(plannedLessonsCount !== undefined ? { plannedLessonsCount } : {}),
        ...(totalAmountRub !== undefined ? { totalAmountRub } : {})
      });
      form.reset();
      setMessage("Абонемент и счёт созданы.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <WalletCards aria-hidden="true" size={18} />
        Абонемент
      </h2>
      <label className="label">
        Ребёнок
        <ChildSelect childOptions={childOptions} disabled={disabled} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Начало
          <input className="field" name="periodStart" type="date" required disabled={disabled} />
        </label>
        <label className="label">
          Конец
          <input className="field" name="periodEnd" type="date" required disabled={disabled} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Занятий
          <input className="field" name="plannedLessonsCount" type="number" min={1} placeholder="По расписанию" disabled={disabled} />
        </label>
        <label className="label">
          Сумма абонемента, ₽
          <input className="field" name="totalAmountRub" type="number" min={1} step="1" placeholder="3600" required disabled={disabled} />
        </label>
      </div>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" disabled={disabled} />
    </form>
  );
}

function PaymentStatusForm({ childOptions, subscriptions }: BillingFormsProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState("");
  const disabled = childOptions.length === 0;
  const latestSubscriptions = useMemo(() => {
    const latest = new Map<string, PaymentStatusSubscription>();
    const sorted = [...subscriptions].sort((a, b) =>
      b.periodEnd.localeCompare(a.periodEnd) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
    );
    for (const subscription of sorted) {
      if (!latest.has(subscription.childId)) latest.set(subscription.childId, subscription);
    }
    return latest;
  }, [subscriptions]);
  const subscription = latestSubscriptions.get(selectedChildId);
  const statusDisabled = disabled || !subscription || subscription.manualPaymentStatusLocked;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (statusDisabled || isSubmitting) return;
    setMessage("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await submitJson(`/api/children/${formData.get("childId")}/payment-status`, "PATCH", {
        status: formData.get("status"),
        comment: formData.get("comment")
      });
      form.reset();
      setMessage("Статус оплаты обновлён.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CreditCard aria-hidden="true" size={18} />
        Оплата
      </h2>
      <label className="label">
        Ребёнок
        <ChildSelect childOptions={childOptions} disabled={disabled} onValueChange={setSelectedChildId} />
      </label>
      <label className="label">
        Статус
        {subscription?.manualPaymentStatusLocked ? (
          <input className="field" value={labelForEnum(subscription.paymentStatus)} readOnly disabled />
        ) : (
          <PaymentStatusSelect name="status" disabled={statusDisabled || isSubmitting} />
        )}
      </label>
      <label className="label">
        Комментарий
        <input className="field" name="comment" minLength={1} required disabled={statusDisabled || isSubmitting} />
      </label>
      {subscription?.manualPaymentStatusLocked ? (
        <p className="text-sm text-[var(--muted)]">Статус рассчитан по оплатам или зачётам</p>
      ) : selectedChildId && !subscription ? (
        <p className="text-sm text-[var(--muted)]">Сначала создайте абонемент ребёнку.</p>
      ) : null}
      <FormFooter isSubmitting={isSubmitting} message={message} label="Обновить" disabled={statusDisabled} />
    </form>
  );
}

function AdmissionCheckForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const payload = await submitJson<{ result: { checkedCount: number; updatedCount: number; createdTaskCount: number } }>(
        "/api/jobs/admission-status-check",
        "POST",
        {}
      );
      setMessage(`Проверено: ${payload.result.checkedCount}. Недопуск: ${payload.result.updatedCount}. Задач: ${payload.result.createdTaskCount}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить проверку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel flex flex-wrap items-center justify-between gap-4 p-5" onSubmit={onSubmit}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--red-soft)] text-[var(--danger-strong)]">
          <ShieldAlert aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold">Проверка недопуска</h2>
          {message ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{message}</p> : null}
        </div>
      </div>
      <Button type="submit" variant="secondary" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
        Запустить
      </Button>
    </form>
  );
}

function ChildSelect({ childOptions, disabled, onValueChange }: { childOptions: Child[]; disabled: boolean; onValueChange?: (value: string) => void }) {
  return (
    <SearchableCombobox
      name="childId"
      required
      disabled={disabled}
      onValueChange={onValueChange}
      placeholder="Найти ребёнка"
      options={childOptions.map((child) => ({
        value: child.id,
        label: child.fullName,
        description: `${child.currentGroup?.name ?? "без группы"} · баланс ${child.cachedLessonBalance} · ${labelForEnum(child.admissionStatus)}`
      }))}
    />
  );
}

function PaymentStatusSelect({ name, disabled }: { name: string; disabled: boolean }) {
  return (
    <select className="field" name={name} required disabled={disabled}>
      {paymentStatuses.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

function FormFooter({ isSubmitting, message, label, disabled = false }: { isSubmitting: boolean; message: string; label: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
        {label}
      </Button>
      {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}
