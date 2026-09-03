import { z } from "zod";
import { optionalTextSchema, uuidSchema } from "@/server/shared/schemas";

export const optionalParentPhoneSchema = z
  .preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().nullable().optional())
  .transform((value) => (value === undefined ? undefined : value));

const parentBaseSchema = z.object({
  fullName: optionalTextSchema,
  phone: optionalParentPhoneSchema,
  vkProfileUrl: optionalTextSchema,
  comment: optionalTextSchema
});

export const createParentSchema = parentBaseSchema.refine((input) => input.phone, {
    message: "У родителя должен быть телефон.",
    path: ["phone"]
  });

export const updateParentSchema = parentBaseSchema.partial();

export const createParentInviteSchema = z.object({
  parentId: uuidSchema
});

export const activateParentInviteSchema = z.object({
  token: z.string().trim().min(20, "Некорректная ссылка активации."),
  password: z.string().min(10, "Пароль должен быть не короче 10 символов.")
});

export const confirmParentPasswordResetSchema = z.object({
  token: z.string().trim().min(20, "Некорректная ссылка восстановления."),
  password: z.string().min(10, "Пароль должен быть не короче 10 символов.")
});

export type CreateParentInput = z.infer<typeof createParentSchema>;
export type UpdateParentInput = z.infer<typeof updateParentSchema>;
export type CreateParentInviteInput = z.infer<typeof createParentInviteSchema>;
export type ActivateParentInviteInput = z.infer<typeof activateParentInviteSchema>;
export type ConfirmParentPasswordResetInput = z.infer<typeof confirmParentPasswordResetSchema>;
