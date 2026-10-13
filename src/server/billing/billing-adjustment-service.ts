import type { Prisma } from "@/generated/prisma/client";

// Credits are consumed only by a later, unpaid invoice for the same child and parent.
// A refund obligation remains separate; this function never initiates a transfer.
export async function applyAvailableCreditsToInvoice(tx: Prisma.TransactionClient, invoiceId: string) {
  await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${invoiceId}::uuid FOR UPDATE`;
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { attempts: { select: { id: true } }, payments: { select: { id: true } } }
  });
  if (!invoice.periodStart || !["DRAFT", "ISSUED", "OVERDUE"].includes(invoice.status) ||
      invoice.paidAmountKopeks > 0 || invoice.attempts.length > 0 || invoice.payments.length > 0) return 0;

  const candidates = await tx.billingAdjustment.findMany({
    where: { schoolId: invoice.schoolId, childId: invoice.childId, parentId: invoice.parentId,
      kind: "CREDIT", sourceSubscription: { periodEnd: { lt: invoice.periodStart } } },
    orderBy: { createdAt: "asc" }
  });
  let remaining = invoice.amountKopeks;
  let applied = 0;
  for (const credit of candidates) {
    if (remaining === 0) break;
    await tx.$queryRaw`SELECT "id" FROM "billing_adjustments" WHERE "id" = ${credit.id}::uuid FOR UPDATE`;
    const fresh = await tx.billingAdjustment.findUniqueOrThrow({ where: { id: credit.id } });
    const amount = Math.min(remaining, fresh.amountKopeks - fresh.appliedAmountKopeks);
    if (amount <= 0) continue;
    await tx.billingAdjustment.update({ where: { id: credit.id }, data: { appliedAmountKopeks: { increment: amount } } });
    await tx.billingAdjustmentApplication.create({ data: { adjustmentId: credit.id, invoiceId, amountKopeks: amount } });
    remaining -= amount;
    applied += amount;
  }
  if (applied > 0) {
    await tx.invoice.update({ where: { id: invoiceId }, data: {
      amountKopeks: remaining,
      status: remaining === 0 ? "PAID" : invoice.status === "OVERDUE" ? "ISSUED" : undefined,
      paidAt: remaining === 0 ? new Date() : undefined
    } });
    if (remaining === 0 && invoice.subscriptionId) await tx.subscription.update({ where: { id: invoice.subscriptionId }, data: { paymentStatus: "PAID", paymentStatusComment: "Счёт полностью покрыт зачётом переплаты" } });
  }
  return applied;
}
