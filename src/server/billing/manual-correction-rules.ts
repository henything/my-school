import { z } from "zod";

export const MAX_MANUAL_LESSONS = 31;
export const correctionReason = z.string().trim().min(1, "Укажите причину изменения.").max(1000, "Причина — не более 1000 символов.");
export const rublesSchema = z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, "Введите сумму в рублях, не более двух знаков после запятой.")
  .transform(value => { const [whole, fraction = ""] = value.replace(",", ".").split("."); return Number(whole) * 100 + Number(fraction.padEnd(2, "0")); })
  .pipe(z.number().int().min(0).max(2_000_000_000, "Сумма слишком большая."));
export const correctionInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("LESSON_BALANCE"), childId: z.string().uuid(), direction: z.enum(["ADD", "SUBTRACT"]), quantity: z.coerce.number().int().min(1).max(MAX_MANUAL_LESSONS, `За одну операцию можно изменить не более ${MAX_MANUAL_LESSONS} занятий.`), reason: correctionReason }),
  z.object({ kind: z.literal("INVOICE_AMOUNT"), invoiceId: z.string().uuid(), targetAmountRub: rublesSchema, reason: correctionReason }),
  z.object({ kind: z.literal("REVERSE"), operationId: z.string().uuid().optional(), transactionId: z.string().uuid().optional(), reason: correctionReason }).refine(x => Boolean(x.operationId) !== Boolean(x.transactionId), "Выберите одну исходную корректировку.")
]);
export type CorrectionInput = z.infer<typeof correctionInputSchema>;
export const correctionApplySchema = z.object({ input: z.unknown(), operationId: z.string().uuid(), expectedVersion: z.string().regex(/^[a-f0-9]{64}$/) });
export class CorrectionConflict extends Error {}
export function adjustedInvoiceAmount(ordinaryKopeks: number, manualKopeks: number, creditKopeks: number) {
  return Math.max(0, Math.max(0, ordinaryKopeks + manualKopeks) - creditKopeks);
}
export function correctionInvoiceBlockReason(invoice: { status: string; paidAmountKopeks: number; payments: unknown[]; attempts: unknown[] }) {
  if (invoice.paidAmountKopeks > 0 || invoice.payments.length || invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID") return "По счёту есть оплата или зачёт. Используйте оформление зачёта или суммы к возврату; история оплаты сохраняется.";
  if (invoice.attempts.length || invoice.status === "PAYMENT_PENDING") return "По счёту уже запускалась онлайн-оплата. Нужна проверка администратора перед изменением суммы.";
  if (!["DRAFT", "ISSUED", "OVERDUE"].includes(invoice.status)) return "Статус счёта не допускает ручное изменение суммы.";
  return null;
}
