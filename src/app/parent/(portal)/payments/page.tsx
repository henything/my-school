import { CreditCard } from "lucide-react";
import { StatusBadge } from "@/components/badges";
import { requireRole } from "@/server/auth/current-user";
import { listParentInvoices } from "@/server/parents/parent-portal-service";

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

export default async function ParentPaymentsPage() {
  const currentUser = await requireRole(["PARENT"]);
  const invoices = await listParentInvoices(currentUser);

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">Кабинет родителя</p>
        <h1 className="mt-2 text-2xl font-bold">Оплаты</h1>
      </section>

      <section className="panel">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-4">
          <CreditCard aria-hidden="true" size={18} />
          <h2 className="text-lg font-bold">Счета</h2>
        </div>
        <div className="table-shell">
          <table className="data-table min-w-[920px]">
            <thead>
              <tr>
                <th>Счёт</th>
                <th>Ребёнок</th>
                <th>Сумма</th>
                <th>Остаток</th>
                <th>Срок</th>
                <th>Статус</th>
                <th>Оплата</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="font-semibold">{invoice.number}</td>
                  <td>{invoice.child.fullName}</td>
                  <td>{formatKopeks(invoice.amountKopeks)}</td>
                  <td className="font-bold">{formatKopeks(invoice.remainingAmountKopeks)}</td>
                  <td>{invoice.dueDate}</td>
                  <td>
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td>
                    {invoice.status === "PAID" ? (
                      <span className="font-semibold text-[var(--success)]">Оплачен</span>
                    ) : invoice.status === "CANCELLED" ? (
                      <span className="font-semibold text-[var(--muted)]">Отменён</span>
                    ) : (
                      <span className="font-semibold text-[var(--muted)]">Онлайн-оплата настраивается</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 ? <div className="p-5 text-sm font-semibold text-[var(--muted)]">Счетов пока нет.</div> : null}
        </div>
      </section>
    </div>
  );
}

function formatKopeks(value: number) {
  return rubFormatter.format(value / 100);
}
