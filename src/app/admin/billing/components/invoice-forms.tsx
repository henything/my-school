"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { labelForEnum } from "@/lib/labels";

type SubscriptionOption = {
  id: string;
  child: { fullName: string };
  periodStart: string;
  periodEnd: string;
  totalAmountKopeks: number;
  paymentStatus: string;
};

type InvoiceOption = {
  id: string;
  number: string;
  status: string;
  remainingAmountKopeks: number;
  child: { fullName: string };
};

type InvoiceFormsProps = {
  subscriptions: SubscriptionOption[];
  invoices: InvoiceOption[];
};

async function submitJson<T = unknown>(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "Не удалось сохранить.");
  }

  return payload;
}

export function InvoiceForms({ subscriptions, invoices }: InvoiceFormsProps) {
  const invoiceableSubscriptions = subscriptions.filter((subscription) => subscription.paymentStatus === "NOT_INVOICED");
  const openInvoices = invoices.filter((invoice) => !["PAID", "CANCELLED"].includes(invoice.status));

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <CreateInvoiceForm subscriptions={invoiceableSubscriptions} />
      <ManualPaymentForm invoices={openInvoices} />
    </section>
  );
}

function CreateInvoiceForm({ subscriptions }: { subscriptions: SubscriptionOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = subscriptions.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      await submitJson("/api/admin/invoices", {
        subscriptionId: formData.get("subscriptionId"),
        dueDate: formData.get("dueDate")
      });
      event.currentTarget.reset();
      setMessage("Счёт создан.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать счёт.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <FilePlus2 aria-hidden="true" size={18} />
        Счёт
      </h2>
      <div className="label">
        <span>Абонемент</span>
        <SearchableCombobox
          name="subscriptionId"
          required
          disabled={disabled}
          placeholder="Найти абонемент"
          options={subscriptions.map((subscription) => ({
            value: subscription.id,
            label: subscription.child.fullName,
            description: `${subscription.periodStart}-${subscription.periodEnd} · ${formatKopeks(subscription.totalAmountKopeks)} · ${labelForEnum(subscription.paymentStatus)}`
          }))}
        />
      </div>
      <label className="label">
        Срок оплаты
        <input className="field" name="dueDate" type="date" required disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" disabled={disabled} />
    </form>
  );
}

function ManualPaymentForm({ invoices }: { invoices: InvoiceOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = invoices.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const amountRub = Number(formData.get("amountRub") || 0);

    try {
      await submitJson(`/api/admin/invoices/${formData.get("invoiceId")}/mark-paid`, {
        ...(amountRub > 0 ? { amountKopeks: Math.round(amountRub * 100) } : {}),
        comment: formData.get("comment")
      });
      form.reset();
      setMessage("Оплата сохранена.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить оплату.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Receipt aria-hidden="true" size={18} />
        Ручная оплата
      </h2>
      <div className="label">
        <span>Счёт</span>
        <SearchableCombobox
          name="invoiceId"
          required
          disabled={disabled}
          placeholder="Найти счёт"
          options={invoices.map((invoice) => ({
            value: invoice.id,
            label: `${invoice.number} · ${invoice.child.fullName}`,
            description: `остаток ${formatKopeks(invoice.remainingAmountKopeks)} · ${labelForEnum(invoice.status)}`
          }))}
        />
      </div>
      <label className="label">
        Сумма, руб.
        <input className="field" name="amountRub" type="number" min={1} step={1} placeholder="Весь остаток" disabled={disabled} />
      </label>
      <label className="label">
        Комментарий
        <input className="field" name="comment" minLength={1} required disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Сохранить" disabled={disabled} />
    </form>
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

function formatKopeks(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(value / 100);
}
