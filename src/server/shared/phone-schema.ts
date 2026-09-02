import { z } from "zod";

const STRICT_PHONE_PATTERN = /^\+7\d{10}$/;

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

    if (!STRICT_PHONE_PATTERN.test(value)) {
      context.addIssue({
        code: "custom",
        message: "Телефон должен быть в формате +7XXXXXXXXXX."
      });
    }
  })
  .transform((value) => (value === undefined ? undefined : value));
