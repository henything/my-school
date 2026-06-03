import { z } from "zod";

export const createUserSchema = z.object({
  login: z.string().trim().min(3, "Login must be at least 3 characters."),
  password: z.string().min(10, "Password must be at least 10 characters."),
  displayName: z.string().trim().min(2, "Display name is required."),
  role: z.enum(["ADMIN", "COACH"])
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"])
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
