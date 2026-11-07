import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { writeAuditLog } from "@/server/audit/audit-service";
import { assertRole, ADMIN_ROLES } from "@/server/rbac/rbac";
import { createTaskIfNotExists } from "@/server/tasks/task-service";

// Caller holds the child lock. Cash and unsettled payment/credit operations are never erased.
export async function archiveChildBilling(tx: Prisma.TransactionClient, user: CurrentUser, child: { id: string; fullName: string }, reason: string) {
  assertRole(user, ADMIN_ROLES);
  await tx.$queryRaw`SELECT id FROM invoices WHERE child_id=${child.id}::uuid AND school_id=${user.schoolId}::uuid ORDER BY id FOR UPDATE`;
  const invoices = await tx.invoice.findMany({
    where: { schoolId: user.schoolId, childId: child.id, status: { not: "CANCELLED" } },
    include: { payments: { select: { status: true } }, attempts: { select: { status: true } }, billingAdjustmentApplications: { select: { id: true } } }
  });
  const cancelled: string[] = [];
  const review: string[] = [];
  for (const invoice of invoices) {
    const appliedMakeup = invoice.subscriptionId ? await tx.lessonBalanceTransaction.findFirst({
      where: { schoolId: user.schoolId, childId: child.id, subscriptionId: invoice.subscriptionId, type: "MAKEUP_USED", reason: "INVOICE_DISCOUNT" }, select: { id: true }
    }) : null;
    const hasValueOrPayment = Boolean(appliedMakeup) || invoice.paidAmountKopeks > 0 || ["PAID", "PARTIALLY_PAID"].includes(invoice.status) ||
      invoice.payments.some(p => ["SUCCEEDED", "REFUNDED", "PENDING"].includes(p.status)) ||
      invoice.attempts.some(p => ["CREATED", "REDIRECTED", "PENDING", "SUCCEEDED"].includes(p.status)) || invoice.billingAdjustmentApplications.length > 0;
    if (hasValueOrPayment) { review.push(invoice.number); continue; }
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    cancelled.push(invoice.id);
    await writeAuditLog({ schoolId: user.schoolId, actorUserId: user.id, action: "INVOICE_CANCELLED_ON_CHILD_ARCHIVE", entityType: "Invoice", entityId: invoice.id,
      oldValue: { status: invoice.status, amountKopeks: invoice.amountKopeks }, newValue: { status: "CANCELLED", amountKopeks: invoice.amountKopeks }, comment: reason }, tx);
  }
  if (review.length) {
    const admin = await tx.user.findFirst({ where: { schoolId: user.schoolId, status: "ACTIVE", role: { in: ["ADMIN", "SUPER_ADMIN"] } }, orderBy: { createdAt: "asc" }, select: { id: true } });
    await createTaskIfNotExists(tx, { schoolId: user.schoolId, actorUserId: user.id, type: "BILLING_RECONCILIATION_REQUIRED", priority: "HIGH", assigneeUserId: admin?.id ?? user.id,
      relatedEntityType: "ChildArchiveBilling", relatedEntityId: child.id, childId: child.id, title: `Проверить расчёт при архивации: ${child.fullName}`,
      description: `Ребёнок в архиве. Сохранены счета с оплатой, зачётом или незавершённой оплатой: ${review.join(", ")}. Проверьте остаток, компенсацию или сумму к возврату. Возврат автоматически не проводится.` });
  }
  return { cancelledInvoiceIds: cancelled, reviewInvoiceCount: review.length };
}
