import { z } from "zod";
import { entityStatusSchema, optionalTextSchema } from "@/server/shared/schemas";

export const createBranchSchema = z.object({
  name: z.string().trim().min(2, "Название филиала обязательно."),
  address: optionalTextSchema,
  inventoryNotes: optionalTextSchema,
  comment: optionalTextSchema,
  lessonPriceKopeks: z.union([z.literal(45000), z.literal(37500)]).default(45000)
});

export const updateBranchSchema = createBranchSchema.omit({ lessonPriceKopeks: true }).partial().extend({
  status: entityStatusSchema.optional()
});

export type CreateBranchInput = z.input<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
