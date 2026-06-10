import { z } from "zod";
import { entityStatusSchema, optionalTextSchema, uuidSchema } from "@/server/shared/schemas";

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, "Название группы обязательно."),
  branchId: uuidSchema,
  mainCoachId: uuidSchema,
  capacityLimit: z.coerce.number().int().min(1).max(50).default(15),
  inventoryNotes: optionalTextSchema,
  comment: optionalTextSchema
});

export const updateGroupSchema = createGroupSchema.partial().extend({
  status: entityStatusSchema.optional()
});

export const attachChildToGroupSchema = z.object({
  childId: uuidSchema
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type AttachChildToGroupInput = z.infer<typeof attachChildToGroupSchema>;
