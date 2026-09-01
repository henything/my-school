"use client";

import { Search, WalletCards } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { RoleBadge } from "@/components/badges";
import { cn } from "@/lib/cn";
import { labelForEnum, labelsForSearch } from "@/lib/labels";

type Child = {
  id: string;
  fullName: string;
  status: string;
  admissionStatus: string;
  cachedLessonBalance: number;
  cachedMakeupBalance: number;
  currentGroup: { name: string } | null;
};

type Subscription = {
  id: string;
  childId: string;
  child: { fullName: string };
  periodStart: string;
  periodEnd: string;
  plannedLessonsCount: number;
  lessonPriceKopeks: number;
  totalAmountKopeks: number;
  paymentStatus: string;
  paymentStatusChangedAt: string | null;
  paymentStatusComment: string | null;
};

type Invoice = {
  id: string;
  number: string;
  child: { fullName: string };
  parent: { fullName: string | null; phone: string | null };
  amountKopeks: number;
  paidAmountKopeks: number;
  dueDate: string;
  status: string;
};

type Payment = {
  id: string;
  invoiceNumber: string;
  child: { fullName: string };
  provider: string;
  amountKopeks: number;
  status: string;
  createdAt: string;
};

type BalanceTransaction = {
  id: string;
  childId: string;
  type: string;
  balanceType: string;
  amount: number;
  reason: string | null;
  comment: string | null;
  createdAt: string;
};

type BillingTablesProps = {
  childRows: Child[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  payments: Payment[];
  transactions: BalanceTransaction[];
  children?: ReactNode;
};

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

export function BillingTables({ childRows, subscriptions, invoices, payments, transactions, children }: BillingTablesProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const normalizedQuery = normalize(query);
  const childById = useMemo(() => new Map(childRows.map((child) => [child.id, child])), [childRows]);

  const filteredChildren = useMemo(
    () =>
      childRows.filter((child) => {
        const matchesStatus = statusFilter === "ALL" || child.status === statusFilter || child.admissionStatus === statusFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          normalize(`${child.fullName} ${child.currentGroup?.name ?? ""} ${labelsForSearch(child.status, child.admissionStatus)} ${child.cachedLessonBalance}`).includes(
            normalizedQuery
          );

        return matchesStatus && matchesQuery;
      }),
    [childRows, normalizedQuery, statusFilter]
  );

  const filteredSubscriptions = useMemo(
    () =>
      subscriptions.filter((subscription) => {
        const matchesStatus = statusFilter === "ALL" || subscription.paymentStatus === statusFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          normalize(`${subscription.child.fullName} ${subscription.periodStart} ${subscription.periodEnd} ${labelsForSearch(subscription.paymentStatus)} ${subscription.paymentStatusComment ?? ""}`).includes(
            normalizedQuery
          );

        return matchesStatus && matchesQuery;
      }),
    [normalizedQuery, statusFilter, subscriptions]
  );

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        const matchesStatus = statusFilter === "ALL" || invoice.status === statusFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          normalize(`${invoice.number} ${invoice.child.fullName} ${invoice.parent.fullName ?? ""} ${invoice.parent.phone ?? ""} ${labelsForSearch(invoice.status)}`).includes(normalizedQuery);

        return matchesStatus && matchesQuery;
      }),
    [invoices, normalizedQuery, statusFilter]
  );

  const filteredPayments = useMemo(
    () =>
      payments.filter((payment) => {
        const matchesStatus = statusFilter === "ALL" || payment.status === statusFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          normalize(`${payment.invoiceNumber} ${payment.child.fullName} ${payment.provider} ${labelsForSearch(payment.status)}`).includes(normalizedQuery);

        return matchesStatus && matchesQuery;
      }),
    [normalizedQuery, payments, statusFilter]
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const child = childById.get(transaction.childId);
        const matchesQuery =
          normalizedQuery.length === 0 ||
          normalize(`${child?.fullName ?? transaction.childId} ${labelsForSearch(transaction.type, transaction.balanceType, transaction.reason)} ${transaction.comment ?? ""}`).includes(normalizedQuery);

        return matchesQuery;
      }),
    [childById, normalizedQuery, transactions]
  );

  const debtChildren = childRows.filter((child) => child.cachedLessonBalance < 0);
  const notAdmittedChildren = childRows.filter((child) => child.admissionStatus === "NOT_ADMITTED");
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "OVERDUE" || invoice.status === "NOT_PAID");
  const attentionChildren = childRows.filter((child) => child.cachedLessonBalance < 0 || child.admissionStatus !== "ADMITTED").slice(0, 6);

  return (
    <section className="grid gap-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <WalletCards className="text-[var(--accent)]" aria-hidden="true" size={18} />
              Деньги и допуск
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Поиск по ребёнку, счёту, родителю и статусу во всех финансовых таблицах.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricChip label="Долг" value={debtChildren.length} tone={debtChildren.length > 0 ? "danger" : "neutral"} />
            <MetricChip label="Недопуск" value={notAdmittedChildren.length} tone={notAdmittedChildren.length > 0 ? "danger" : "neutral"} />
            <MetricChip label="Просрочка" value={overdueInvoices.length} tone={overdueInvoices.length > 0 ? "danger" : "neutral"} />
            <MetricChip label="Счета" value={invoices.length} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="label">
            Поиск
            <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ребёнок, счёт, родитель, статус" />
          </label>
          <label className="label">
            Статус
            <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">Все статусы</option>
              <option value="ADMITTED">{labelForEnum("ADMITTED")}</option>
              <option value="CREDIT_LESSON_USED">{labelForEnum("CREDIT_LESSON_USED")}</option>
              <option value="NOT_ADMITTED">{labelForEnum("NOT_ADMITTED")}</option>
              <option value="NOT_INVOICED">{labelForEnum("NOT_INVOICED")}</option>
              <option value="INVOICED">{labelForEnum("INVOICED")}</option>
              <option value="NOT_PAID">{labelForEnum("NOT_PAID")}</option>
              <option value="PARTIALLY_PAID">{labelForEnum("PARTIALLY_PAID")}</option>
              <option value="OVERDUE">{labelForEnum("OVERDUE")}</option>
              <option value="PAID">{labelForEnum("PAID")}</option>
              <option value="SUCCEEDED">{labelForEnum("SUCCEEDED")}</option>
              <option value="FAILED">{labelForEnum("FAILED")}</option>
            </select>
          </label>
        </div>

        {attentionChildren.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {attentionChildren.map((child) => (
              <div key={child.id} className="rounded-lg border border-[#ffb3bd] bg-[var(--red-soft)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{child.fullName}</span>
                  <RoleBadge role={child.admissionStatus} />
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  Баланс: <span className="font-bold text-[var(--danger)]">{child.cachedLessonBalance}</span> · {child.currentGroup?.name ?? "без группы"}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {children ? <div className="grid gap-4">{children}</div> : null}

      <DataPanel title="Дети и текущие балансы" count={`${filteredChildren.length} из ${childRows.length}`}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Ребёнок</th>
              <th>Группа</th>
              <th>Занятия</th>
              <th>Отработки</th>
              <th>Допуск</th>
            </tr>
          </thead>
          <tbody>
            {filteredChildren.map((child) => (
              <tr key={child.id} className={child.cachedLessonBalance < 0 || child.admissionStatus !== "ADMITTED" ? "bg-[var(--red-soft)]" : undefined}>
                <td className="font-semibold">{child.fullName}</td>
                <td>{child.currentGroup?.name ?? "-"}</td>
                <td className={child.cachedLessonBalance < 0 ? "font-bold text-[var(--danger)]" : "font-semibold"}>{child.cachedLessonBalance}</td>
                <td className="font-semibold">{child.cachedMakeupBalance}</td>
                <td>
                  <RoleBadge role={child.admissionStatus} />
                </td>
              </tr>
            ))}
            {filteredChildren.length === 0 ? <EmptyTableRow colSpan={5} label="Дети по фильтрам не найдены." /> : null}
          </tbody>
        </table>
      </DataPanel>

      <DataPanel title="Абонементы" count={`${filteredSubscriptions.length} из ${subscriptions.length}`}>
        <table className="data-table min-w-[980px]">
          <thead>
            <tr>
              <th>Ребёнок</th>
              <th>Период</th>
              <th>Занятия</th>
              <th>Цена</th>
              <th>Сумма</th>
              <th>Оплата</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {filteredSubscriptions.map((subscription) => (
              <tr key={subscription.id}>
                <td className="font-semibold">{subscription.child.fullName}</td>
                <td>
                  {subscription.periodStart} - {subscription.periodEnd}
                </td>
                <td>{subscription.plannedLessonsCount}</td>
                <td>{formatKopeks(subscription.lessonPriceKopeks)}</td>
                <td className="font-semibold">{formatKopeks(subscription.totalAmountKopeks)}</td>
                <td>
                  <PaymentBadge status={subscription.paymentStatus} />
                  {subscription.paymentStatusChangedAt ? (
                    <div className="mt-1 text-xs text-[var(--muted)]">{new Date(subscription.paymentStatusChangedAt).toLocaleString("ru-RU")}</div>
                  ) : null}
                </td>
                <td>{subscription.paymentStatusComment ?? "-"}</td>
              </tr>
            ))}
            {filteredSubscriptions.length === 0 ? <EmptyTableRow colSpan={7} label="Абонементы по фильтрам не найдены." /> : null}
          </tbody>
        </table>
      </DataPanel>

      <DataPanel title="Счета" count={`${filteredInvoices.length} из ${invoices.length}`}>
        <table className="data-table min-w-[1080px]">
          <thead>
            <tr>
              <th>Номер</th>
              <th>Ребёнок</th>
              <th>Родитель</th>
              <th>Сумма</th>
              <th>Оплачено</th>
              <th>Срок</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice) => (
              <tr key={invoice.id} className={invoice.status === "OVERDUE" || invoice.status === "NOT_PAID" ? "bg-[var(--red-soft)]" : undefined}>
                <td className="font-semibold">{invoice.number}</td>
                <td>{invoice.child.fullName}</td>
                <td>
                  <div>{invoice.parent.fullName ?? "-"}</div>
                  {invoice.parent.phone ? <div className="text-xs text-[var(--muted)]">{invoice.parent.phone}</div> : null}
                </td>
                <td className="font-semibold">{formatKopeks(invoice.amountKopeks)}</td>
                <td>{formatKopeks(invoice.paidAmountKopeks)}</td>
                <td>{invoice.dueDate}</td>
                <td>
                  <PaymentBadge status={invoice.status} />
                </td>
              </tr>
            ))}
            {filteredInvoices.length === 0 ? <EmptyTableRow colSpan={7} label="Счета по фильтрам не найдены." /> : null}
          </tbody>
        </table>
      </DataPanel>

      <DataPanel title="Платежи" count={`${filteredPayments.length} из ${payments.length}`}>
        <table className="data-table min-w-[980px]">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Счёт</th>
              <th>Ребёнок</th>
              <th>Источник</th>
              <th>Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map((payment) => (
              <tr key={payment.id}>
                <td>{new Date(payment.createdAt).toLocaleString("ru-RU")}</td>
                <td>{payment.invoiceNumber}</td>
                <td>{payment.child.fullName}</td>
                <td>{payment.provider}</td>
                <td className="font-semibold">{formatKopeks(payment.amountKopeks)}</td>
                <td>
                  <PaymentBadge status={payment.status} />
                </td>
              </tr>
            ))}
            {filteredPayments.length === 0 ? <EmptyTableRow colSpan={6} label="Платежи по фильтрам не найдены." /> : null}
          </tbody>
        </table>
      </DataPanel>

      <DataPanel title="Последние движения баланса" count={`${filteredTransactions.length} из ${transactions.length}`}>
        <table className="data-table min-w-[980px]">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Ребёнок</th>
              <th>Тип</th>
              <th>Баланс</th>
              <th>Движение</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((transaction) => {
              const child = childById.get(transaction.childId);

              return (
                <tr key={transaction.id}>
                  <td>{new Date(transaction.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="font-semibold">{child?.fullName ?? transaction.childId}</td>
                  <td>{labelForEnum(transaction.type)}</td>
                  <td>{labelForEnum(transaction.balanceType)}</td>
                  <td className={transaction.amount < 0 ? "font-bold text-[var(--danger)]" : "font-bold text-[var(--success)]"}>
                    {transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount}
                  </td>
                  <td>{transaction.comment ?? (transaction.reason ? labelForEnum(transaction.reason) : "-")}</td>
                </tr>
              );
            })}
            {filteredTransactions.length === 0 ? <EmptyTableRow colSpan={6} label="Движения по фильтрам не найдены." /> : null}
          </tbody>
        </table>
      </DataPanel>
    </section>
  );
}

function DataPanel({ title, count, children }: { title: string; count: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Search className="text-[var(--accent)]" aria-hidden="true" size={18} />
          {title}
        </h2>
        <span className="text-sm font-semibold text-[var(--muted)]">{count}</span>
      </div>
      <div className="table-shell">{children}</div>
    </div>
  );
}

function MetricChip({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "danger" }) {
  return (
    <span className={cn("badge", tone === "danger" ? "bg-[var(--red-soft)] text-[var(--danger-strong)]" : "bg-[var(--blue-soft)] text-[var(--accent-strong)]")}>
      {label}: {value}
    </span>
  );
}

function EmptyTableRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-sm font-semibold text-[var(--muted)]">
        {label}
      </td>
    </tr>
  );
}

function formatKopeks(value: number) {
  return rubFormatter.format(value / 100);
}

function PaymentBadge({ status }: { status: string }) {
  const className =
    status === "PAID" || status === "SUCCEEDED"
      ? "bg-[var(--green-soft)] text-[var(--success-strong)]"
      : status === "OVERDUE" || status === "NOT_PAID" || status === "FAILED"
        ? "bg-[var(--red-soft)] text-[var(--danger-strong)]"
        : status === "PARTIALLY_PAID"
          ? "bg-[var(--yellow-soft)] text-[var(--warning-strong)]"
          : "bg-[var(--blue-soft)] text-[var(--accent-strong)]";

  return <span className={`badge ${className}`}>{labelForEnum(status)}</span>;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
