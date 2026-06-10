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

export const updateChildSchema = z.object({
  fullName: z.string().trim().min(2, "ФИО ребёнка обязательно.").optional(),
  parentId: uuidSchema.optional().nullable(),
  currentGroupId: uuidSchema.optional().nullable(),
  birthDate: patchDateSchema,
  status: childStatusSchema.optional(),
  medicalNotes: optionalTextSchema,
  coachComment: optionalTextSchema,
  adminComment: optionalTextSchema,
  admissionStatus: admissionStatusSchema.optional()
});

export type CreateChildInput = z.infer<typeof createChildSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
