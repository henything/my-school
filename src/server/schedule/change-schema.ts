import { z } from "zod";
import { requiredCommentSchema, uuidSchema } from "@/server/shared/schemas";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату начала в формате ГГГГ-ММ-ДД.").refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Укажите существующую дату.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время в формате ЧЧ:ММ.");
export const scheduleChangeSchema = z.object({
  groupId: uuidSchema,
  effectiveFrom: date,
  slots: z.array(z.object({ weekday: z.number().int().min(1).max(7), startTime: time, endTime: time }))
    .min(1, "Выберите хотя бы один день.").max(14).superRefine((slots, context) => {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slots.slice(0, i).some(other => other.weekday === slot.weekday)) context.addIssue({ code: "custom", message: "Для одного дня недели выберите одно занятие. Это сохраняет смысл графика «раз в неделю»." });
        if (slot.startTime >= slot.endTime) context.addIssue({ code: "custom", message: "Окончание должно быть позже начала." });
        if (slots.slice(0, i).some(other => other.weekday === slot.weekday && other.startTime < slot.endTime && slot.startTime < other.endTime)) {
          context.addIssue({ code: "custom", message: "Занятия в один день не должны пересекаться." });
        }
      }
    }),
  plans: z.array(z.object({ childId: uuidSchema, effectiveFrom: date, weekday: z.number().int().min(1).max(7).nullable() })).max(1000).default([]),
  reason: requiredCommentSchema,
  action: z.enum(["preview", "apply"]).default("preview"),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  acknowledgeManualTasks: z.boolean().default(false)
});
export type ScheduleChangeInput = z.infer<typeof scheduleChangeSchema>;
