import { z } from "zod";
import {
  admissionStatusSchema,
  childStatusSchema,
  optionalDateSchema,
  optionalTextSchema,
  uuidSchema
} from "@/server/shared/schemas";

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
  admissionStatus: admissionStatusSchema.default("ADMITTED")
});

export const createChildEnrollmentSchema = createChildSchema.omit({ parentId: true }).extend({
  parentId: uuidSchema.optional().nullable(),
  parentFullName: optionalTextSchema,
  parentPhone: optionalTextSchema,
  parentVkProfileUrl: optionalTextSchema,
  parentComment: optionalTextSchema
}).superRefine((input, context) => {
  const hasParentId = Boolean(input.parentId);
  const hasNewParentIdentity = Boolean(input.parentFullName || input.parentPhone);
  const hasNewParentFields = Boolean(input.parentFullName || input.parentPhone || input.parentVkProfileUrl || input.parentComment);

  if (hasParentId && hasNewParentFields) {
    context.addIssue({
      code: "custom",
      message: "Выберите существующего родителя или заполните нового, но не оба варианта.",
      path: ["parentId"]
    });
  }

  if (!hasParentId && hasNewParentFields && !hasNewParentIdentity) {
    context.addIssue({
      code: "custom",
      message: "Для нового родителя нужно указать имя или телефон.",
      path: ["parentFullName"]
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

export type CreateChildInput = z.infer<typeof createChildSchema>;
export type CreateChildEnrollmentInput = z.infer<typeof createChildEnrollmentSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
