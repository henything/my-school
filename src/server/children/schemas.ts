import { z } from "zod";
import {
  admissionStatusSchema,
  childStatusSchema,
  optionalDateSchema,
  optionalTextSchema,
  uuidSchema
} from "@/server/shared/schemas";
import { optionalParentPhoneSchema } from "@/server/parents/schemas";

const patchDateSchema = z
  .union([
    z
      .string()
      .trim()
      .transform((value) => (value.length > 0 ? new Date(`${value}T00:00:00.000Z`) : null)),
    z.null()
  ])
  .optional();

export const createChildSchema = z.object({
  fullName: z.string().trim().min(2, "ФИО ребёнка обязательно."),
  parentId: uuidSchema.optional().nullable(),
  currentGroupId: uuidSchema.optional().nullable(),
  birthDate: optionalDateSchema,
  status: childStatusSchema.default("ACTIVE"),
  medicalNotes: optionalTextSchema,
  coachComment: optionalTextSchema,
  adminComment: optionalTextSchema,
  admissionStatus: admissionStatusSchema.default("ADMITTED"),
  attendanceWeekday: z.number().int().min(1).max(7).nullable().optional()
});

export const createChildEnrollmentSchema = createChildSchema.omit({ parentId: true }).extend({
  parentId: uuidSchema.optional().nullable(),
  parentFullName: optionalTextSchema,
  parentPhone: optionalParentPhoneSchema,
  parentVkProfileUrl: optionalTextSchema,
  comment: optionalTextSchema,
  parentComment: optionalTextSchema
}).superRefine((input, context) => {
  const hasParentId = Boolean(input.parentId);
  const hasNewParentFields = Boolean(input.parentFullName || input.parentPhone || input.parentVkProfileUrl || input.parentComment);

  if (hasParentId && hasNewParentFields) {
    context.addIssue({
      code: "custom",
      message: "Выберите существующего родителя или заполните нового, но не оба варианта.",
      path: ["parentId"]
    });
  }

  if (!hasParentId && hasNewParentFields && !input.parentPhone) {
    context.addIssue({
      code: "custom",
      message: "Для нового родителя нужно указать телефон.",
      path: ["parentPhone"]
    });
  }
});

export const updateChildSchema = z.object({
  fullName: z.string().trim().min(2, "ФИО ребёнка обязательно.").optional(),
  parentId: uuidSchema.optional().nullable(),
  currentGroupId: uuidSchema.optional().nullable(),
  birthDate: patchDateSchema,
  status: childStatusSchema.optional(),
  medicalNotes: optionalTextSchema,
  coachComment: optionalTextSchema,
  adminComment: optionalTextSchema,
  statusChangeComment: optionalTextSchema,
  admissionStatus: admissionStatusSchema.optional()
});

export const setChildAttendancePlanSchema = z.object({
  weekday: z.number().int().min(1, "Выберите день недели.").max(7, "Выберите день недели.").nullable(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату начала.")
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Некорректная дата начала.")
    .transform((value) => new Date(`${value}T00:00:00.000Z`))
});

export type CreateChildInput = z.infer<typeof createChildSchema>;
export type CreateChildEnrollmentInput = z.infer<typeof createChildEnrollmentSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
export type SetChildAttendancePlanInput = z.infer<typeof setChildAttendancePlanSchema>;
