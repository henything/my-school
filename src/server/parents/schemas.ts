import { z } from "zod";
import { optionalTextSchema } from "@/server/shared/schemas";

const parentBaseSchema = z.object({
  fullName: optionalTextSchema,
  phone: optionalTextSchema,
  vkProfileUrl: optionalTextSchema,
  comment: optionalTextSchema
});

export const createParentSchema = parentBaseSchema.refine((input) => input.fullName || input.phone, {
    message: "У родителя должно быть имя или телефон."
  });

export const updateParentSchema = parentBaseSchema.partial();

export type CreateParentInput = z.infer<typeof createParentSchema>;
export type UpdateParentInput = z.infer<typeof updateParentSchema>;
