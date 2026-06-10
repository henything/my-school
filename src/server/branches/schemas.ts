import { z } from "zod";
import { entityStatusSchema, optionalTextSchema } from "@/server/shared/schemas";

export const createBranchSchema = z.object({
  name: z.string().trim().min(2, "Название филиала обязательно."),
  address: optionalTextSchema,
  inventoryNotes: optionalTextSchema,
  comment: optionalTextSchema
});

export const updateBranchSchema = createBranchSchema.partial().extend({
  status: entityStatusSchema.optional()
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
