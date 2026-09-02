import { BillingForms } from "@/app/admin/billing/components/billing-forms";
import { BillingTables } from "@/app/admin/billing/components/billing-tables";
import { InvoiceForms } from "@/app/admin/billing/components/invoice-forms";
import { WorkQueuePanel } from "@/components/work-queue-panel";
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
        <h1 className="mt-2 text-2xl font-bold">Абонементы, оплата и балансы</h1>
      </section>

      <WorkQueuePanel
        title="Критичные задачи по допуску"
        subtitle="Долг и недопуск влияют на доступ ребёнка к занятиям, поэтому эта очередь стоит выше форм."
        tasks={billingTasks}
        tone="critical"
      />

      <BillingTables childRows={children} subscriptions={subscriptions} invoices={invoices} payments={payments} transactions={transactions}>
        <BillingForms childOptions={children} />
        <InvoiceForms subscriptions={subscriptions} invoices={invoices} />
      </BillingTables>
    </div>
  );
}
