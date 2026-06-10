import { z } from "zod";

export const uuidSchema = z.string().uuid("Invalid id.");

export const optionalTextSchema = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .optional()
  .nullable();

export const optionalDateSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => {
    if (!value) {
      return null;
    }

    return new Date(`${value}T00:00:00.000Z`);
  });

export const entityStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const childStatusSchema = z.enum(["ACTIVE", "PAUSED", "LEFT", "TRIAL", "ARCHIVED"]);
export const admissionStatusSchema = z.enum(["ADMITTED", "CREDIT_LESSON_USED", "NOT_ADMITTED"]);
