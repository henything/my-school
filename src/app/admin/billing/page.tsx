import { BillingForms } from "@/app/admin/billing/components/billing-forms";
import { InvoiceForms } from "@/app/admin/billing/components/invoice-forms";
import { RoleBadge } from "@/components/badges";
import { requireRole } from "@/server/auth/current-user";
import { listBalanceTransactions, listInvoices, listPayments, listSubscriptions } from "@/server/billing/billing-service";
import { listChildren } from "@/server/children/child-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { listTasks } from "@/server/tasks/task-service";

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

export default async function BillingPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const [children, subscriptions, invoices, payments, transactions, tasks] = await Promise.all([
    listChildren(currentUser),
    listSubscriptions(currentUser),
    listInvoices(currentUser),
    listPayments(currentUser),
    listBalanceTransactions(currentUser),
    listTasks(currentUser)
  ]);
  const childById = new Map(children.map((child) => [child.id, child]));
  const billingTasks = tasks.filter((task) => task.type === "CHILD_TOOK_CREDIT_LESSON" || task.type === "CHILD_NOT_ADMITTED");

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-04</p>
        <h1 className="mt-2 text-2xl font-bold">Абонементы, оплата и балансы</h1>
      </section>

      {billingTasks.length > 0 ? (
        <section className="panel border-[#c25b53] bg-[#fff4f2] p-5">
          <h2 className="text-lg font-bold text-[#8f1d17]">Критичные задачи по допуску</h2>
          <div className="mt-4 grid gap-3">
            {billingTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-[#efb5ae] bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge bg-[#f8d8d4] text-[#8f1d17]">{task.priority}</span>
                  <span className="font-semibold">{task.title}</span>
                </div>
                {task.description ? <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <BillingForms childOptions={children} />
      <InvoiceForms subscriptions={subscriptions} invoices={invoices} />

      <section className="grid gap-4">
        <div className="panel">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Дети и текущие балансы</h2>
          </div>
          <div className="table-shell">
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
                {children.map((child) => (
                  <tr key={child.id}>
                    <td className="font-semibold">{child.fullName}</td>
                    <td>{child.currentGroup?.name ?? "-"}</td>
                    <td className={child.cachedLessonBalance < 0 ? "font-bold text-[var(--danger)]" : "font-semibold"}>
                      {child.cachedLessonBalance}
                    </td>
                    <td className="font-semibold">{child.cachedMakeupBalance}</td>
                    <td>
                      <RoleBadge role={child.admissionStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Абонементы</h2>
          </div>
          <div className="table-shell">
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
                {subscriptions.map((subscription) => (
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
                        <div className="mt-1 text-xs text-[var(--muted)]">
                          {new Date(subscription.paymentStatusChangedAt).toLocaleString("ru-RU")}
                        </div>
                      ) : null}
                    </td>
                    <td>{subscription.paymentStatusComment ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Счета</h2>
          </div>
          <div className="table-shell">
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
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-semibold">{invoice.number}</td>
                    <td>{invoice.child.fullName}</td>
                    <td>
                      <div>{invoice.parent.fullName ?? "—"}</div>
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
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Платежи</h2>
          </div>
          <div className="table-shell">
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
                {payments.map((payment) => (
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
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Последние движения баланса</h2>
          </div>
          <div className="table-shell">
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
                {transactions.map((transaction) => {
                  const child = childById.get(transaction.childId);

                  return (
                    <tr key={transaction.id}>
                      <td>{new Date(transaction.createdAt).toLocaleString("ru-RU")}</td>
                      <td className="font-semibold">{child?.fullName ?? transaction.childId}</td>
                      <td>{transaction.type}</td>
                      <td>{transaction.balanceType}</td>
                      <td className={transaction.amount < 0 ? "font-bold text-[var(--danger)]" : "font-bold text-[var(--success)]"}>
                        {transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount}
                      </td>
                      <td>{transaction.comment ?? transaction.reason ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatKopeks(value: number) {
  return rubFormatter.format(value / 100);
}

function PaymentBadge({ status }: { status: string }) {
  const className =
    status === "PAID"
      ? "bg-[#dff1ea] text-[#075a3d]"
      : status === "OVERDUE" || status === "NOT_PAID"
        ? "bg-[#f8d8d4] text-[#8f1d17]"
        : status === "PARTIALLY_PAID"
          ? "bg-[#f7e4d1] text-[#7a3f0d]"
          : "bg-[#e6eff8] text-[#214f78]";

  return <span className={`badge ${className}`}>{status}</span>;
}
