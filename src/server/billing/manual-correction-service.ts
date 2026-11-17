import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { writeAuditLog } from "@/server/audit/audit-service";
import { admissionStatusAfterLessonBalance } from "./calculations";
import { adjustedInvoiceAmount, CorrectionConflict, correctionInvoiceBlockReason, type CorrectionInput } from "./manual-correction-rules";

type Tx = Prisma.TransactionClient;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type CorrectionPreview = {
  childId: string; childName: string; invoiceId: string | null; invoiceNumber: string | null; invoicePeriod: string | null;
  kind: "LESSON_BALANCE" | "INVOICE_AMOUNT"; previousValue: number; nextValue: number; delta: number;
  currentLessonBalance: number; nextLessonBalance: number; reason: string; version: string;
  unchanged: boolean; reversedOperationId: string | null; sourceTransactionId: string | null;
  manualTotalKopeks: number | null; ordinaryKopeks: number | null; creditKopeks: number;
};
async function resolveTarget(tx: Tx, user: CurrentUser, input: CorrectionInput) {
  if (input.kind === "LESSON_BALANCE") return { childId: input.childId, invoiceId: null, kind: input.kind, delta: input.direction === "ADD" ? input.quantity : -input.quantity, reverseId: null, sourceId: null };
  if (input.kind === "INVOICE_AMOUNT") {
    const invoice = await tx.invoice.findFirstOrThrow({ where: { id: input.invoiceId, schoolId: user.schoolId }, select: { childId: true } });
    return { childId: invoice.childId, invoiceId: input.invoiceId, kind: input.kind, delta: 0, reverseId: null, sourceId: null };
  }
  if (input.operationId) {
    const operation = await tx.billingCorrectionOperation.findFirstOrThrow({ where: { id: input.operationId, schoolId: user.schoolId }, include: { reversal: { select: { id: true } } } });
    if (operation.reversal || operation.reversedOperationId || operation.sourceTransactionId) throw new Error("Эта корректировка уже отменена или является отменой другой операции.");
    return { childId: operation.childId, invoiceId: operation.invoiceId, kind: operation.kind as "LESSON_BALANCE" | "INVOICE_AMOUNT", delta: -operation.delta, reverseId: operation.id, sourceId: null };
  }
  const transaction = await tx.lessonBalanceTransaction.findFirstOrThrow({ where: { id: input.transactionId!, schoolId: user.schoolId }, include: { sourceCorrection: true, balanceCorrection: true } });
  if (transaction.type !== "MANUAL_ADJUSTMENT" || transaction.reason !== "MANUAL_ADJUSTMENT" || transaction.balanceType !== "LESSON_BALANCE" || transaction.sourceCorrection || transaction.balanceCorrection) throw new Error("Выберите исходную ручную корректировку занятий, которая ещё не отменена.");
  return { childId: transaction.childId, invoiceId: null, kind: "LESSON_BALANCE" as const, delta: -transaction.amount, reverseId: null, sourceId: transaction.id };
}
async function previewInTransaction(tx: Tx, user: CurrentUser, input: CorrectionInput): Promise<CorrectionPreview> {
  const target = await resolveTarget(tx, user, input);
  const child = await tx.child.findFirstOrThrow({ where: { id: target.childId, schoolId: user.schoolId } });
  if (child.status === "ARCHIVED" || child.status === "LEFT") throw new Error("Ребёнок в архиве или ушёл. Нужна отдельная проверка истории.");
  let previousValue = child.cachedLessonBalance;
  let nextValue = previousValue + target.delta;
  let delta = target.delta;
  let manualTotalKopeks: number | null = null;
  let ordinaryKopeks: number | null = null;
  let invoiceNumber: string | null = null;
  let invoicePeriod: string | null = null;
  let creditKopeks = 0;
  let invoiceVersion: unknown = null;
  if (target.invoiceId) {
    const invoice = await tx.invoice.findFirstOrThrow({ where: { id: target.invoiceId, childId: child.id, schoolId: user.schoolId }, include: { attempts: { select: { id: true } }, payments: { select: { id: true } }, billingAdjustmentApplications: { select: { id: true, amountKopeks: true } } } });
    const block = correctionInvoiceBlockReason(invoice);
    if (block) throw new Error(block);
    if (invoice.subscriptionId && await tx.invoice.count({ where: { schoolId: user.schoolId, subscriptionId: invoice.subscriptionId, status: { not: "CANCELLED" } } }) !== 1) throw new Error("У абонемента несколько действующих счетов. Нужна проверка администратора.");
    creditKopeks = invoice.billingAdjustmentApplications.reduce((sum, x) => sum + x.amountKopeks, 0);
    ordinaryKopeks = invoice.manualBasisKopeks ?? invoice.amountKopeks + creditKopeks - invoice.manualAdjustmentKopeks;
    manualTotalKopeks = input.kind === "INVOICE_AMOUNT" ? input.targetAmountRub + creditKopeks - ordinaryKopeks : invoice.manualAdjustmentKopeks + delta;
    delta = manualTotalKopeks - invoice.manualAdjustmentKopeks;
    previousValue = invoice.amountKopeks;
    nextValue = adjustedInvoiceAmount(ordinaryKopeks, manualTotalKopeks, creditKopeks);
    // A new target of the existing amount is a no-op, including invoices at the zero floor.
    if (input.kind === "INVOICE_AMOUNT" && nextValue === previousValue) { delta = 0; manualTotalKopeks = invoice.manualAdjustmentKopeks; }
    invoiceNumber = invoice.number;
    invoicePeriod = invoice.periodStart && invoice.periodEnd ? `${invoice.periodStart.toISOString().slice(0,10)} — ${invoice.periodEnd.toISOString().slice(0,10)}` : null;
    invoiceVersion = { updatedAt: invoice.updatedAt, status: invoice.status, manual: invoice.manualAdjustmentKopeks, basis: ordinaryKopeks, creditKopeks, attempts: invoice.attempts, payments: invoice.payments, subscriptionId: invoice.subscriptionId };
  } else if (nextValue < -1) throw new Error("После списания остаток будет ниже −1 занятия. Проверьте количество и посещаемость.");
  if (![previousValue, nextValue, delta, manualTotalKopeks ?? 0].every(n => Number.isSafeInteger(n) && Math.abs(n) <= 2_000_000_000)) throw new Error("Результат корректировки слишком большой.");
  const preview = { childId: child.id, childName: child.fullName, invoiceId: target.invoiceId, invoiceNumber, invoicePeriod, kind: target.kind, previousValue, nextValue, delta, currentLessonBalance: child.cachedLessonBalance, nextLessonBalance: target.invoiceId ? child.cachedLessonBalance : nextValue, reason: input.reason, unchanged: delta === 0, reversedOperationId: target.reverseId, sourceTransactionId: target.sourceId, manualTotalKopeks, ordinaryKopeks, creditKopeks };
  return { ...preview, version: digest({ input, preview, childUpdatedAt: child.updatedAt, invoiceVersion }) };
}
export async function previewCorrection(user: CurrentUser, input: CorrectionInput) {
  assertRole(user, ADMIN_ROLES);
  return getPrisma().$transaction(tx => previewInTransaction(tx, user, input));
}
export async function applyCorrection(user: CurrentUser, input: CorrectionInput, operationId: string, expectedVersion: string) {
  assertRole(user, ADMIN_ROLES);
  const requestHash = digest(input);
  return getPrisma().$transaction(async tx => {
    const findPrior = () => tx.billingCorrectionOperation.findUnique({ where: { schoolId_operationId: { schoolId: user.schoolId, operationId } } });
    const replay = (prior: NonNullable<Awaited<ReturnType<typeof findPrior>>>) => {
      if (prior.requestHash !== requestHash) throw new CorrectionConflict("Этот номер операции уже использован для другого изменения.");
      return prior.result as unknown as CorrectionPreview;
    };
    const prior = await findPrior();
    if (prior) return replay(prior);
    const target = await resolveTarget(tx, user, input);
    await tx.$queryRaw`SELECT id FROM children WHERE id=${target.childId}::uuid AND school_id=${user.schoolId}::uuid FOR UPDATE`;
    const raced = await findPrior();
    if (raced) return replay(raced);
    if (target.invoiceId) {
      const invoice = await tx.invoice.findFirstOrThrow({ where: { id: target.invoiceId, schoolId: user.schoolId }, select: { subscriptionId: true } });
      if (invoice.subscriptionId) await tx.$queryRaw`SELECT id FROM subscriptions WHERE id=${invoice.subscriptionId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM invoices WHERE id=${target.invoiceId}::uuid FOR UPDATE`;
    }
    const preview = await previewInTransaction(tx, user, input);
    if (preview.version !== expectedVersion) throw new CorrectionConflict("Данные изменились. Получите новый расчёт.");
    let balanceTransactionId: string | null = null;
    if (!preview.unchanged && preview.kind === "LESSON_BALANCE") {
      const child = await tx.child.findUniqueOrThrow({ where: { id: preview.childId } });
      const movement = await tx.lessonBalanceTransaction.create({ data: { schoolId: user.schoolId, childId: child.id, type: "MANUAL_ADJUSTMENT", balanceType: "LESSON_BALANCE", amount: preview.delta, reason: "MANUAL_BALANCE_CORRECTION", comment: input.reason, createdByUserId: user.id } });
      balanceTransactionId = movement.id;
      await tx.child.update({ where: { id: child.id }, data: { cachedLessonBalance: { increment: preview.delta }, admissionStatus: admissionStatusAfterLessonBalance(preview.nextValue, child.admissionStatus) } });
    } else if (!preview.unchanged) {
      const invoice = await tx.invoice.update({ where: { id: preview.invoiceId! }, data: { amountKopeks: preview.nextValue, manualAdjustmentKopeks: preview.manualTotalKopeks!, manualBasisKopeks: preview.ordinaryKopeks, status: preview.nextValue === 0 ? (preview.creditKopeks ? "PAID" : "CANCELLED") : undefined, cancelledAt: preview.nextValue === 0 && !preview.creditKopeks ? new Date() : null, paidAt: preview.nextValue === 0 && preview.creditKopeks ? new Date() : null } });
      if (invoice.subscriptionId) await tx.subscription.update({ where: { id: invoice.subscriptionId }, data: { paymentStatus: preview.nextValue === 0 ? (preview.creditKopeks ? "PAID" : "NOT_INVOICED") : "INVOICED", paymentStatusComment: `Ручное изменение счёта: ${input.reason}` } });
    }
    const operation = await tx.billingCorrectionOperation.create({ data: { schoolId: user.schoolId, actorUserId: user.id, childId: preview.childId, invoiceId: preview.invoiceId, operationId, requestHash, kind: preview.kind, previousValue: preview.previousValue, nextValue: preview.nextValue, delta: preview.delta, reason: input.reason, result: preview as unknown as Prisma.InputJsonValue, reversedOperationId: preview.reversedOperationId, sourceTransactionId: preview.sourceTransactionId, balanceTransactionId } });
    await writeAuditLog({ schoolId: user.schoolId, actorUserId: user.id, action: "BILLING_CORRECTION_APPLIED", entityType: "BillingCorrectionOperation", entityId: operation.id, oldValue: { value: preview.previousValue }, newValue: preview as unknown as Prisma.InputJsonValue, comment: input.reason }, tx);
    return preview;
  }).catch(async error => {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const prior = await getPrisma().billingCorrectionOperation.findUnique({ where: { schoolId_operationId: { schoolId: user.schoolId, operationId } } });
      if (prior?.requestHash === requestHash) return prior.result as unknown as CorrectionPreview;
      throw new CorrectionConflict("Операция уже применена или исходная корректировка уже отменена. Обновите историю.");
    }
    throw error;
  });
}
export async function correctionHistory(user: CurrentUser, childId: string) {
  assertRole(user, ADMIN_ROLES);
  const prisma = getPrisma();
  await prisma.child.findFirstOrThrow({ where: { id: childId, schoolId: user.schoolId }, select: { id: true } });
  const [operations, legacy] = await Promise.all([
    prisma.billingCorrectionOperation.findMany({ where: { schoolId: user.schoolId, childId, delta: { not: 0 } }, include: { actor: { select: { displayName: true } }, reversal: { select: { id: true } }, invoice: { select: { number: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.lessonBalanceTransaction.findMany({ where: { schoolId: user.schoolId, childId, type: "MANUAL_ADJUSTMENT", reason: "MANUAL_ADJUSTMENT", balanceType: "LESSON_BALANCE", balanceCorrection: null }, include: { createdBy: { select: { displayName: true } }, sourceCorrection: { select: { id: true } } }, orderBy: { createdAt: "desc" }, take: 100 })
  ]);
  return [...operations.map(x => ({ id: x.id, transactionId: null, kind: x.kind, delta: x.delta, previousValue: x.previousValue, nextValue: x.nextValue, reason: x.reason, date: x.createdAt.toISOString(), actor: x.actor.displayName, invoice: x.invoice?.number ?? null, reversed: Boolean(x.reversal), canReverse: !x.reversal && !x.reversedOperationId && !x.sourceTransactionId })), ...legacy.map(x => ({ id: x.id, transactionId: x.id, kind: "LESSON_BALANCE", delta: x.amount, previousValue: null, nextValue: null, reason: x.comment ?? "Старая ручная корректировка", date: x.createdAt.toISOString(), actor: x.createdBy?.displayName ?? "—", invoice: null, reversed: Boolean(x.sourceCorrection), canReverse: !x.sourceCorrection }))].sort((a,b) => b.date.localeCompare(a.date));
}
