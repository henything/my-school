import { z } from "zod";
import { optionalTextSchema } from "@/server/shared/schemas";

export const createCoachSchema = z.object({
  login: z.string().trim().min(3, "Login must be at least 3 characters."),
  password: z.string().min(10, "Password must be at least 10 characters."),
  displayName: z.string().trim().min(2, "Display name is required."),
  phone: optionalTextSchema,
  notes: optionalTextSchema
});

export const updateCoachSchema = z.object({
  phone: optionalTextSchema,
  notes: optionalTextSchema,
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional()
});

export type CreateCoachInput = z.infer<typeof createCoachSchema>;
export type UpdateCoachInput = z.infer<typeof updateCoachSchema>;
