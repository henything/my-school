import { z } from "zod";

const PHONE_PATTERN = /^(?=.{5,30}$)(?=.*\d)[+0-9()\s.-]+$/;

export const optionalPhoneSchema = z
  .preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().nullable().optional())
  .superRefine((value, context) => {
    if (!value) {
      return;
    }

    if (!PHONE_PATTERN.test(value)) {
      context.addIssue({
        code: "custom",
        message: "Телефон может содержать цифры, пробелы, +, скобки, точки и дефисы."
      });
    }
  })
  .transform((value) => (value === undefined ? undefined : value));
