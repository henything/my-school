import { z } from "zod";
import { requiredCommentSchema, uuidSchema } from "@/server/shared/schemas";
import { DEFAULT_LESSON_PRICE_KOPEKS } from "./calculations";

export const paymentStatusSchema = z.enum(["NOT_INVOICED", "INVOICED", "NOT_PAID", "PAID", "PARTIALLY_PAID", "OVERDUE"]);

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const createSubscriptionSchema = z
  .object({
    childId: uuidSchema,
    periodStart: dateOnlySchema,
    periodEnd: dateOnlySchema,
    plannedLessonsCount: z.coerce.number().int().positive().optional(),
    totalAmountRub: z.coerce.number().positive("Сумма абонемента должна быть больше 0.").optional(),
    lessonPriceKopeks: z.coerce.number().int().positive().default(DEFAULT_LESSON_PRICE_KOPEKS),
    paymentStatus: paymentStatusSchema.default("NOT_INVOICED")
  })
  .transform((input) => ({
    ...input,
    totalAmountKopeks: input.totalAmountRub === undefined ? undefined : Math.round(input.totalAmountRub * 100)
  }))
  .refine((input) => input.periodEnd >= input.periodStart, {
    message: "Дата окончания абонемента должна быть не раньше даты начала.",
    path: ["periodEnd"]
  });

export const updatePaymentStatusSchema = z.object({
  status: paymentStatusSchema,
  comment: requiredCommentSchema
});

export const createInvoiceSchema = z.object({
  subscriptionId: uuidSchema,
  dueDate: dateOnlySchema
});

export const markInvoicePaidSchema = z.object({
  amountKopeks: z.coerce.number().int().positive().optional(),
  comment: requiredCommentSchema
});

export const manualBalanceAdjustmentSchema = z.object({
  balanceType: z.enum(["LESSON_BALANCE", "MAKEUP_BALANCE"]).default("LESSON_BALANCE"),
  amount: z.coerce.number().int().refine((value) => value !== 0, "Корректировка не может быть нулевой."),
  comment: requiredCommentSchema
});

export const admissionStatusJobSchema = z.object({
  now: z.coerce.date().optional()
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type MarkInvoicePaidInput = z.infer<typeof markInvoicePaidSchema>;
export type UpdatePaymentStatusInput = z.infer<typeof updatePaymentStatusSchema>;
export type ManualBalanceAdjustmentInput = z.infer<typeof manualBalanceAdjustmentSchema>;
export type AdmissionStatusJobInput = z.infer<typeof admissionStatusJobSchema>;
