import { z } from "zod";
import { optionalTextSchema, uuidSchema } from "@/server/shared/schemas";

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const createMedicalCertificateSchema = z
  .object({
    childId: uuidSchema,
    attendanceRecordId: uuidSchema.optional().nullable(),
    periodStart: dateOnlySchema,
    periodEnd: dateOnlySchema,
    comment: optionalTextSchema
  })
  .refine((input) => input.periodEnd >= input.periodStart, {
    message: "Дата окончания должна быть не раньше даты начала.",
    path: ["periodEnd"]
  });

export const reviewMedicalCertificateSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"]),
    adminComment: optionalTextSchema
  })
  .refine((input) => input.status === "APPROVED" || Boolean(input.adminComment), {
    message: "Укажите комментарий при отклонении справки.",
    path: ["adminComment"]
  });

export type CreateMedicalCertificateInput = z.infer<typeof createMedicalCertificateSchema>;
export type ReviewMedicalCertificateInput = z.infer<typeof reviewMedicalCertificateSchema>;
