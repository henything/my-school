import { z } from "zod";
import { optionalTextSchema, requiredCommentSchema, uuidSchema } from "@/server/shared/schemas";
import { lessonChangeReasonSchema } from "@/server/schedule/schemas";

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const adminFinalAttendanceStatusSchema = z.enum([
  "ABSENT_SICK_CONFIRMED",
  "ABSENT_VACATION_APPROVED",
  "ABSENT_QUARANTINE",
  "ABSENT_EVENT",
  "ABSENT_UNEXCUSED_FINAL"
]);

export const finalizeAttendanceSchema = z.object({
  finalStatus: adminFinalAttendanceStatusSchema,
  comment: optionalTextSchema
});

export const createVacationSchema = z
  .object({
    periodStart: dateOnlySchema,
    periodEnd: dateOnlySchema,
    comment: optionalTextSchema,
    today: z.coerce.date().optional()
  })
  .refine((input) => input.periodEnd >= input.periodStart, {
    message: "Дата окончания отпуска должна быть не раньше даты начала.",
    path: ["periodEnd"]
  });

export const createGroupEventSchema = z
  .object({
    groupId: uuidSchema,
    reason: lessonChangeReasonSchema,
    periodStart: dateOnlySchema,
    periodEnd: dateOnlySchema,
    comment: requiredCommentSchema
  })
  .refine((input) => input.periodEnd >= input.periodStart, {
    message: "Дата окончания события должна быть не раньше даты начала.",
    path: ["periodEnd"]
  });

export const assignMakeupSchema = z.object({
  assignedLessonId: uuidSchema,
  comment: requiredCommentSchema
});

export const closeMakeupSchema = z.object({
  status: z.enum(["USED", "REFUNDED", "CANCELLED"]),
  comment: requiredCommentSchema
});

export const sicknessFollowUpJobSchema = z.object({
  now: z.coerce.date().optional()
});

export type FinalizeAttendanceInput = z.infer<typeof finalizeAttendanceSchema>;
export type CreateVacationInput = z.infer<typeof createVacationSchema>;
export type CreateGroupEventInput = z.infer<typeof createGroupEventSchema>;
export type AssignMakeupInput = z.infer<typeof assignMakeupSchema>;
export type CloseMakeupInput = z.infer<typeof closeMakeupSchema>;
export type SicknessFollowUpJobInput = z.infer<typeof sicknessFollowUpJobSchema>;
