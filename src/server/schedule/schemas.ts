import { z } from "zod";
import { requiredCommentSchema, uuidSchema } from "@/server/shared/schemas";

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время должно быть в формате HH:MM.");

const requiredDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

function addTimeRangeValidation<T extends z.ZodRawShape & { startTime: typeof timeSchema; endTime: typeof timeSchema }>(schema: z.ZodObject<T>) {
  return schema.refine(
    (input) => {
      const value = input as { startTime: string; endTime: string };
      return value.startTime < value.endTime;
    },
    {
      message: "Время окончания должно быть позже времени начала.",
      path: ["endTime"]
    }
  );
}

export const lessonChangeReasonSchema = z.enum([
  "QUARANTINE",
  "KINDERGARTEN_EVENT",
  "RUSSIAN_HOLIDAY",
  "COACH_UNAVAILABLE",
  "GROUP_TRANSFER",
  "OTHER"
]);

export const createScheduleTemplateSchema = addTimeRangeValidation(
  z.object({
    groupId: uuidSchema,
    weekday: z.coerce.number().int().min(1, "Выберите день недели.").max(7, "Выберите день недели."),
    startTime: timeSchema,
    endTime: timeSchema
  })
);

export const createLessonSchema = addTimeRangeValidation(
  z.object({
    groupId: uuidSchema,
    coachId: uuidSchema.optional().nullable(),
    lessonDate: requiredDateSchema,
    startTime: timeSchema,
    endTime: timeSchema
  })
);

export const generateMonthSchema = z.object({
  month: z.string().trim().regex(/^\d{4}-\d{2}$/, "Месяц должен быть в формате YYYY-MM."),
  groupId: uuidSchema.optional().nullable()
});

export const moveLessonSchema = addTimeRangeValidation(
  z.object({
    lessonDate: requiredDateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    reason: lessonChangeReasonSchema,
    comment: requiredCommentSchema
  })
);

export const cancelLessonSchema = z.object({
  reason: lessonChangeReasonSchema,
  comment: requiredCommentSchema
});

export const substituteLessonSchema = z.object({
  substituteCoachId: uuidSchema
});

export type CreateScheduleTemplateInput = z.infer<typeof createScheduleTemplateSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type GenerateMonthInput = z.infer<typeof generateMonthSchema>;
export type MoveLessonInput = z.infer<typeof moveLessonSchema>;
export type CancelLessonInput = z.infer<typeof cancelLessonSchema>;
export type SubstituteLessonInput = z.infer<typeof substituteLessonSchema>;
