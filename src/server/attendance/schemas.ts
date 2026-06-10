import { z } from "zod";
import { optionalTextSchema, uuidSchema } from "@/server/shared/schemas";

export const coachAttendanceStatusSchema = z.enum(["NOT_MARKED", "PRESENT", "ABSENT_UNEXCUSED", "ABSENT_SICK_PENDING"]);

export const attendanceRecordInputSchema = z.object({
  childId: uuidSchema,
  status: coachAttendanceStatusSchema,
  comment: optionalTextSchema
});

export const saveAttendanceSchema = z.object({
  records: z.array(attendanceRecordInputSchema).min(1, "Нужно передать хотя бы одну отметку.")
});

export const updateAttendanceRecordSchema = z.object({
  status: coachAttendanceStatusSchema,
  comment: optionalTextSchema
});

export const attendanceNotFilledJobSchema = z.object({
  now: z.coerce.date().optional()
});

export type CoachAttendanceStatusInput = z.infer<typeof coachAttendanceStatusSchema>;
export type AttendanceRecordInput = z.infer<typeof attendanceRecordInputSchema>;
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
export type UpdateAttendanceRecordInput = z.infer<typeof updateAttendanceRecordSchema>;
export type AttendanceNotFilledJobInput = z.infer<typeof attendanceNotFilledJobSchema>;
