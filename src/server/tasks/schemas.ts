import { z } from "zod";
import { optionalDateSchema, optionalTextSchema, uuidSchema } from "@/server/shared/schemas";

const requiredTextSchema = z.string().trim().min(1, "Поле обязательно.");

export const taskPrioritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

export const createManualTaskSchema = z.object({
  priority: taskPrioritySchema.default("MEDIUM"),
  assigneeUserId: uuidSchema.optional().nullable(),
  relatedEntityType: optionalTextSchema,
  relatedEntityId: uuidSchema.optional().nullable(),
  childId: uuidSchema.optional().nullable(),
  groupId: uuidSchema.optional().nullable(),
  title: requiredTextSchema,
  description: optionalTextSchema,
  dueAt: optionalDateSchema
});

export const closeTaskSchema = z.object({
  status: z.enum(["CLOSED", "CANCELLED"]).default("CLOSED"),
  comment: optionalTextSchema
});

export const taskChecksSchema = z.object({
  now: z.coerce.date().optional()
});

export type CreateManualTaskInput = z.infer<typeof createManualTaskSchema>;
export type CloseTaskInput = z.infer<typeof closeTaskSchema>;
export type TaskChecksInput = z.infer<typeof taskChecksSchema>;
