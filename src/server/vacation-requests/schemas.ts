import { z } from "zod";
import { optionalTextSchema, uuidSchema } from "@/server/shared/schemas";

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const createVacationRequestSchema = z
  .object({
    childId: uuidSchema,
    periodStart: dateOnlySchema,
    periodEnd: dateOnlySchema,
    comment: optionalTextSchema
  })
  .refine((input) => input.periodEnd >= input.periodStart, {
    message: "Дата окончания отпуска должна быть не раньше даты начала.",
    path: ["periodEnd"]
  });

export const reviewVacationRequestSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"]),
    adminComment: optionalTextSchema
  })
  .refine((input) => input.status === "APPROVED" || Boolean(input.adminComment), {
    message: "Укажите комментарий при отклонении заявления.",
    path: ["adminComment"]
  });

export type CreateVacationRequestInput = z.infer<typeof createVacationRequestSchema>;
export type ReviewVacationRequestInput = z.infer<typeof reviewVacationRequestSchema>;
