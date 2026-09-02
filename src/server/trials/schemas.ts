import { z } from "zod";
import { optionalPhoneSchema } from "@/server/shared/phone-schema";
import { optionalTextSchema, uuidSchema } from "@/server/shared/schemas";

const optionalAgeSchema = z
  .preprocess((value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? Number(trimmed) : null;
    }

    return value;
  }, z.number().int().min(0, "Возраст не может быть отрицательным.").max(18, "Возраст должен быть до 18 лет.").nullable())
  .optional()
  .nullable();

export const trialStatusSchema = z.enum([
  "TRIAL_BOOKED",
  "TRIAL_ATTENDED",
  "TRIAL_NO_SHOW",
  "CONTACT_COLLECTED",
  "TRANSFERRED_TO_ADMIN",
  "CONVERTED_TO_ACTIVE"
]);

export const trialSourceSchema = z.enum(["VK", "REFERRAL", "KINDERGARTEN", "ADVERTISING", "OTHER", "UNKNOWN"]);

export const createTrialSchema = z.object({
  lessonId: uuidSchema,
  childName: optionalTextSchema,
  childAge: optionalAgeSchema,
  parentName: optionalTextSchema,
  parentPhone: optionalPhoneSchema,
  parentVkUrl: optionalTextSchema,
  source: trialSourceSchema.default("UNKNOWN"),
  comment: optionalTextSchema
});

export const updateTrialStatusSchema = z.object({
  status: trialStatusSchema.optional(),
  childName: optionalTextSchema,
  childAge: optionalAgeSchema,
  parentName: optionalTextSchema,
  parentPhone: optionalPhoneSchema,
  parentVkUrl: optionalTextSchema,
  source: trialSourceSchema.optional(),
  comment: optionalTextSchema
});

export const convertTrialSchema = z.object({
  childFullName: optionalTextSchema,
  parentName: optionalTextSchema,
  parentPhone: optionalPhoneSchema,
  parentVkUrl: optionalTextSchema,
  currentGroupId: uuidSchema.optional().nullable(),
  adminComment: optionalTextSchema
});

export type CreateTrialInput = z.infer<typeof createTrialSchema>;
export type UpdateTrialStatusInput = z.infer<typeof updateTrialStatusSchema>;
export type ConvertTrialInput = z.infer<typeof convertTrialSchema>;
