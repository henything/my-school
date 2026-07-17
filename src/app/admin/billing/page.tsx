import { BillingForms } from "@/app/admin/billing/components/billing-forms";
import { BillingTables } from "@/app/admin/billing/components/billing-tables";
import { InvoiceForms } from "@/app/admin/billing/components/invoice-forms";
import { requireRole } from "@/server/auth/current-user";
import { listBalanceTransactions, listInvoices, listPayments, listSubscriptions } from "@/server/billing/billing-service";
import { listChildren } from "@/server/children/child-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { listTasks } from "@/server/tasks/task-service";

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

      <BillingTables children={children} subscriptions={subscriptions} invoices={invoices} payments={payments} transactions={transactions} />
    </div>
  );
}
